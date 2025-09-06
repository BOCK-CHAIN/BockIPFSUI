const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const FormData = require('form-data');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

// BOCK IPFS direct connection (no proxy)
const BOCK_API = 'http://localhost:9000/bockipfs/api/v0'; // Proxy endpoint

// Utility function to make IPFS requests using curl
const makeCurlRequest = async (url, options = {}) => {
  const { method = 'POST', data = null, responseType = 'json' } = options;
  
  let curlCommand = `curl -s -X ${method}`;
  
  if (data) {
    if (data instanceof FormData) {
      // Handle FormData for file uploads
      const tempFile = path.join(__dirname, 'temp_upload');
      fs.writeFileSync(tempFile, data.getBuffer());
      curlCommand += ` -F "file=@${tempFile}"`;
    } else {
      curlCommand += ` -d "${JSON.stringify(data)}"`;
    }
  }
  
  curlCommand += ` "${url}"`;
  
  console.log('Executing curl command:', curlCommand);
  
  try {
    const { stdout, stderr } = await execAsync(curlCommand);
    
    if (stderr) {
      console.warn('Curl stderr:', stderr);
    }
    
    // Clean up temp file if it exists
    const tempFile = path.join(__dirname, 'temp_upload');
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    
    if (responseType === 'json' && stdout.trim()) {
      try {
        return JSON.parse(stdout);
      } catch (e) {
        return stdout;
      }
    }
    
    return stdout;
  } catch (error) {
    throw new Error(`Curl request failed: ${error.message}`);
  }
};

// Hybrid function - tries curl first, then falls back to axios for non-BOCK endpoints
const makeRequest = async (url, options = {}) => {
  const isBockEndpoint = url.includes('localhost:9000');
  
  if (isBockEndpoint) {
    // Use curl for BOCK endpoints to avoid header conflicts
    return await makeCurlRequest(url, options);
  } else {
    // Use axios for other endpoints (like IPFS gateway)
    const { method = 'GET', data = null, responseType = 'json' } = options;
    const axiosOptions = {
      method,
      url,
      data,
      responseType: responseType === 'stream' ? 'stream' : 'json'
    };
    
    const response = await axios(axiosOptions);
    return response.data;
  }
};

// Multer config for file upload (using memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});
const USER_ROOT = '/users/demo'; // later dynamic per user

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    console.log('Testing BOCK API connection...');
    const response = await makeCurlRequest(`${BOCK_API}/version`);
    
    res.json({ 
      status: 'ok', 
      ipfs: 'connected',
      version: response,
      api_endpoint: BOCK_API,
      method: 'curl'
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(500).json({ 
      status: 'error', 
      ipfs: 'disconnected',
      error: error.message 
    });
  }
});

// Create folder
app.post('/create-folder', async (req, res) => {
  const { folderPath } = req.body;
  
  if (!folderPath) {
    return res.status(400).json({ error: 'folderPath is required' });
  }

  try {
    const fullPath = path.posix.join(USER_ROOT, folderPath);
    console.log(`Creating folder: ${fullPath}`);
    
    const url = `${BOCK_API}/files/mkdir?arg=${encodeURIComponent(fullPath)}&parents=true`;
    console.log('Request URL:', url);
    
    const response = await makeCurlRequest(url);
    
    console.log('Folder created successfully');
    res.json({ success: true, path: fullPath, method: 'curl' });
  } catch (err) {
    console.error('Create folder error:', err.message);
    res.status(500).json({ 
      error: err.message,
      path: fullPath 
    });
  }
});

// Upload file - special handling for file uploads
app.post('/upload-file', upload.single('file'), async (req, res) => {
  const { filePath } = req.body;
  const file = req.file;
  
  if (!file || !filePath) {
    return res.status(400).json({ error: 'file and filePath are required' });
  }

  const fullPath = path.posix.join(USER_ROOT, filePath);
  
  try {
    console.log(`Uploading file to: ${fullPath}`);
    
    const url = `${BOCK_API}/files/write?arg=${encodeURIComponent(fullPath)}&create=true&parents=true&truncate=true`;
    console.log('Upload URL:', url);
    
    // Create a temporary file for curl upload
    const tempFile = path.join(__dirname, `temp_${Date.now()}_${path.basename(filePath)}`);
    fs.writeFileSync(tempFile, file.buffer);
    
    const curlCommand = `curl -s -X POST -F "file=@${tempFile}" "${url}"`;
    console.log('Upload curl command:', curlCommand);
    
    const { stdout, stderr } = await execAsync(curlCommand);
    
    // Clean up temp file
    fs.unlinkSync(tempFile);
    
    if (stderr) {
      console.warn('Upload stderr:', stderr);
    }
    
    console.log('File uploaded successfully');
    res.json({ success: true, path: fullPath, method: 'curl' });
  } catch (err) {
    console.error('Upload file error:', err.message);
    res.status(500).json({ 
      error: err.message,
      path: fullPath 
    });
  }
});

// Rename/Move file or folder
app.post('/rename', async (req, res) => {
  const { oldPath, newPath } = req.body;
  
  if (!oldPath || !newPath) {
    return res.status(400).json({ error: 'oldPath and newPath are required' });
  }

  try {
    const from = path.posix.join(USER_ROOT, oldPath);
    const to = path.posix.join(USER_ROOT, newPath);
    console.log(`Renaming: ${from} -> ${to}`);
    
    const url = `${BOCK_API}/files/mv?arg=${encodeURIComponent(from)}&arg=${encodeURIComponent(to)}`;
    console.log('Request URL:', url);
    
    const response = await makeCurlRequest(url);
    
    console.log('Rename successful');
    res.json({ success: true, from, to, method: 'curl' });
  } catch (err) {
    console.error('Rename error:', err.message);
    res.status(500).json({ 
      error: err.message,
      from: oldPath,
      to: newPath 
    });
  }
});

// List folder contents
app.get('/list', async (req, res) => {
  const { dir = '' } = req.query;
  
  try {
    const dirPath = path.posix.join(USER_ROOT, dir);
    console.log(`Listing directory: ${dirPath}`);
    
    const url = `${BOCK_API}/files/ls?arg=${encodeURIComponent(dirPath)}&long=true`;
    console.log('Request URL:', url);
    
    const response = await makeCurlRequest(url);
    
    console.log('Directory listed successfully');
    res.json({
      success: true,
      path: dirPath,
      entries: response,
      method: 'curl'
    });
  } catch (err) {
    console.error('List directory error:', err.message);
    res.status(500).json({ 
      error: err.message,
      path: dirPath 
    });
  }
});

// Delete file or folder
app.delete('/delete', async (req, res) => {
  const { itemPath } = req.body;
  
  if (!itemPath) {
    return res.status(400).json({ error: 'itemPath is required' });
  }

  try {
    const fullPath = path.posix.join(USER_ROOT, itemPath);
    console.log(`Deleting: ${fullPath}`);
    
    const url = `${BOCK_API}/files/rm?arg=${encodeURIComponent(fullPath)}&recursive=true`;
    console.log('Request URL:', url);
    
    const response = await makeCurlRequest(url);
    
    console.log('Delete successful');
    res.json({ success: true, path: fullPath, method: 'curl' });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ 
      error: err.message,
      path: fullPath 
    });
  }
});

// Get file content via gateway (using CID) - improved for PDFs
app.get('/get-content/:cid', async (req, res) => {
  const { cid } = req.params;
  
  if (!cid) {
    return res.status(400).json({ error: 'CID is required' });
  }

  try {
    console.log(`Getting content for CID: ${cid}`);
    
    const BOCK_GATEWAY = 'http://localhost:8080/ipfs';
    
    // First, try to get content info to determine file type
    const headResponse = await axios.head(`${BOCK_GATEWAY}/${cid}`).catch(() => null);
    
    const response = await axios.get(`${BOCK_GATEWAY}/${cid}`, {
      responseType: 'arraybuffer' // Use arraybuffer for better binary handling
    });
    
    // Determine content type
    let contentType = response.headers['content-type'] || 'application/octet-stream';
    
    // If content type is not set properly, try to detect from data
    if (contentType === 'application/octet-stream' || !contentType) {
      const buffer = Buffer.from(response.data);
      
      // Check PDF signature
      if (buffer.slice(0, 4).toString() === '%PDF') {
        contentType = 'application/pdf';
      }
      // Check for other common file signatures
      else if (buffer.slice(0, 2).toString('hex') === 'ffd8') {
        contentType = 'image/jpeg';
      }
      else if (buffer.slice(0, 8).toString() === '\x89PNG\r\n\x1a\n') {
        contentType = 'image/png';
      }
      else if (buffer.slice(0, 4).toString() === 'GIF8') {
        contentType = 'image/gif';
      }
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', response.data.byteLength);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // For PDFs, ensure inline display
    if (contentType === 'application/pdf') {
      res.setHeader('Content-Disposition', 'inline');
    }
    
    // Send the binary data
    res.send(Buffer.from(response.data));
    
    console.log(`Content served successfully. CID: ${cid}, Size: ${response.data.byteLength} bytes, Type: ${contentType}`);
  } catch (err) {
    console.error('Get content error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data || err.message,
      cid 
    });
  }
});

// Add a dedicated PDF viewer endpoint
app.get('/view-pdf/:cid', async (req, res) => {
  const { cid } = req.params;
  
  if (!cid) {
    return res.status(400).json({ error: 'CID is required' });
  }

  try {
    console.log(`Serving PDF viewer for CID: ${cid}`);
    
    // Create a simple HTML PDF viewer
    const pdfViewerHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>PDF Viewer</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { 
                margin: 0; 
                padding: 20px; 
                font-family: Arial, sans-serif; 
                background: #f0f0f0;
            }
            .container {
                max-width: 100%;
                background: white;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                border-radius: 8px;
                overflow: hidden;
            }
            .header {
                background: #333;
                color: white;
                padding: 10px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .pdf-container {
                width: 100%;
                height: 80vh;
                border: none;
            }
            .error {
                padding: 40px;
                text-align: center;
                color: #666;
            }
            .download-btn {
                background: #007bff;
                color: white;
                padding: 8px 16px;
                text-decoration: none;
                border-radius: 4px;
                font-size: 14px;
            }
            .download-btn:hover {
                background: #0056b3;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h3>PDF Document</h3>
                <a href="/get-content/${cid}" class="download-btn" download="document.pdf">Download PDF</a>
            </div>
            <div id="pdf-viewer">
                <embed src="/get-content/${cid}" type="application/pdf" class="pdf-container" />
            </div>
        </div>
        
        <script>
            // Fallback if embed doesn't work
            window.addEventListener('load', function() {
                setTimeout(function() {
                    const embed = document.querySelector('embed');
                    if (!embed || embed.offsetHeight === 0) {
                        document.getElementById('pdf-viewer').innerHTML = 
                            '<div class="error">' +
                            '<h3>PDF Preview Not Available</h3>' +
                            '<p>Your browser may not support embedded PDFs.</p>' +
                            '<a href="/get-content/${cid}" class="download-btn">Download PDF</a>' +
                            '</div>';
                    }
                }, 2000);
            });
        </script>
    </body>
    </html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(pdfViewerHTML);
  } catch (err) {
    console.error('PDF viewer error:', err.message);
    res.status(500).json({ 
      error: err.message,
      cid 
    });
  }
});
app.get('/file-info', async (req, res) => {
  const { filePath } = req.query;
  
  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }

  try {
    const fullPath = path.posix.join(USER_ROOT, filePath);
    console.log(`Getting file info: ${fullPath}`);
    
    const url = `${BOCK_API}/files/stat?arg=${encodeURIComponent(fullPath)}`;
    console.log('Request URL:', url);
    
    const response = await makeCurlRequest(url);
    
    res.json({
      success: true,
      path: fullPath,
      info: response,
      method: 'curl'
    });
  } catch (err) {
    console.error('File info error:', err.message);
    res.status(500).json({ 
      error: err.message,
      path: fullPath 
    });
  }
});

// Read file content with proper binary handling
app.get('/read-file', (req, res) => {
  const { filePath } = req.query;

  if (!filePath) {
    return res.status(400).send('File path is required');
  }

  const fullPath = path.join(__dirname, filePath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      return res.status(404).send('File not found');
    }

    // Automatically detect content type based on extension
    const contentType = mime.lookup(fullPath) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    // Special handling for PDFs to open inline in browser
    if (contentType === 'application/pdf') {
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(fullPath)}"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Accept-Ranges', 'bytes');
    }

    res.send(data);
  });
});


// Initialize user directory using curl
async function initializeUserDirectory() {
  try {
    console.log('Initializing user directory...');
    console.log(`Target directory: ${USER_ROOT}`);
    
    const url = `${BOCK_API}/files/mkdir?arg=${encodeURIComponent(USER_ROOT)}&parents=true`;
    console.log('Request URL:', url);
    
    const response = await makeCurlRequest(url);
    console.log(`✅ User directory initialized: ${USER_ROOT}`);
    console.log('Response:', response || 'Success (empty response)');
  } catch (error) {
    console.error('❌ Failed to initialize user directory');
    console.error('Error:', error.message);
    
    if (error.message.includes('file already exists')) {
      console.log(`✅ User directory already exists: ${USER_ROOT}`);
    } else {
      console.log('\n🔧 Manual troubleshooting:');
      console.log('1. Check BOCK daemon: .\\bock-ipfs.exe daemon');
      console.log('2. Test manually: curl -X POST "http://localhost:9000/bockipfs/api/v0/version"');
      console.log('3. Create manually: .\\bock-ipfs.exe files mkdir --parents /users/demo');
    }
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = 4000;
app.listen(PORT, async () => {
  console.log(`🚀 BOCK IPFS File Management API running at http://localhost:${PORT}`);
  console.log(`📁 User root directory: ${USER_ROOT}`);
  console.log(`🔗 BOCK API: ${BOCK_API}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /health - Check API and IPFS status');
  console.log('  POST /create-folder - Create a new folder');
  console.log('  POST /upload-file - Upload a file');
  console.log('  POST /rename - Rename/move file or folder');
  console.log('  GET  /list - List directory contents');
  console.log('  DELETE /delete - Delete file or folder');
  console.log('  GET  /read-file - Read file content from MFS');
  console.log('\n🔧 Using curl for all BOCK IPFS requests to avoid header conflicts');
  
  // Initialize user directory
  console.log('\n📋 Initializing user directory...');
  await initializeUserDirectory();
});