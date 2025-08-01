const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(express.json());

// BOCK IPFS direct connection (no proxy)
const BOCK_API = 'http://localhost:9000/bockipfs/api/v0'; // Proxy endpoint


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
    const response = await axios.post(`${BOCK_API}/version`);
    res.json({ 
      status: 'ok', 
      ipfs: 'connected',
      version: response.data,
      api_endpoint: BOCK_API
    });
  } catch (error) {
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
    
    // FIXED: Use query parameters instead of FormData
    const url = `${BOCK_API}/files/mkdir?arg=${encodeURIComponent(fullPath)}&parents=true`;
    console.log('Request URL:', url);
    
    const response = await axios.post(url);
    
    console.log('Folder created successfully');
    res.json({ success: true, path: fullPath });
  } catch (err) {
    console.error('Create folder error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data || err.message,
      path: fullPath 
    });
  }
});

// Upload file
app.post('/upload-file', upload.single('file'), async (req, res) => {
  const { filePath } = req.body;
  const file = req.file;
  
  if (!file || !filePath) {
    return res.status(400).json({ error: 'file and filePath are required' });
  }

  const fullPath = path.posix.join(USER_ROOT, filePath);
  
  try {
    console.log(`Uploading file to: ${fullPath}`);
    
    // FIXED: Use query parameters + FormData file (mixed approach)
    const url = `${BOCK_API}/files/write?arg=${encodeURIComponent(fullPath)}&create=true&parents=true&truncate=true`;
    console.log('Upload URL:', url);
    
    const formData = new FormData();
    // Only add the file to FormData, parameters go in URL
    const fileBuffer = file.buffer;
    formData.append('file', fileBuffer, {
      filename: path.basename(filePath),
      contentType: 'application/octet-stream'
    });
    
    console.log('File buffer size:', fileBuffer.length);
    console.log('Original filename:', file.originalname);
    
    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    
    console.log('File uploaded successfully');
    res.json({ success: true, path: fullPath });
  } catch (err) {
    console.error('Upload file error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data || err.message,
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
    
    // FIXED: Use query parameters for mv command
    const url = `${BOCK_API}/files/mv?arg=${encodeURIComponent(from)}&arg=${encodeURIComponent(to)}`;
    console.log('Request URL:', url);
    
    const response = await axios.post(url);
    
    console.log('Rename successful');
    res.json({ success: true, from, to });
  } catch (err) {
    console.error('Rename error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data || err.message,
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
    
    // FIXED: Use query parameters for ls command
    const url = `${BOCK_API}/files/ls?arg=${encodeURIComponent(dirPath)}&long=true`;
    console.log('Request URL:', url);
    
    const response = await axios.post(url);
    
    console.log('Directory listed successfully');
    res.json({
      success: true,
      path: dirPath,
      entries: response.data
    });
  } catch (err) {
    console.error('List directory error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data || err.message,
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
    
    // FIXED: Use query parameters for rm command
    const url = `${BOCK_API}/files/rm?arg=${encodeURIComponent(fullPath)}&recursive=true`;
    console.log('Request URL:', url);
    
    const response = await axios.post(url);
    
    console.log('Delete successful');
    res.json({ success: true, path: fullPath });
  } catch (err) {
    console.error('Delete error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data || err.message,
      path: fullPath 
    });
  }
});

// Get file content via gateway (using CID)
app.get('/get-content/:cid', async (req, res) => {
  const { cid } = req.params;
  
  if (!cid) {
    return res.status(400).json({ error: 'CID is required' });
  }

  try {
    console.log(`Getting content for CID: ${cid}`);
    
    // Assuming you have a gateway URL defined
    const BOCK_GATEWAY = 'http://localhost:8080/ipfs'; // Direct IPFS gateway
    const response = await axios.get(`${BOCK_GATEWAY}/${cid}`, {
      responseType: 'stream'
    });
    
    // Forward headers
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    
    response.data.pipe(res);
  } catch (err) {
    console.error('Get content error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data || err.message,
      cid 
    });
  }
});

// Get file info (stat)
app.get('/file-info', async (req, res) => {
  const { filePath } = req.query;
  
  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }

  try {
    const fullPath = path.posix.join(USER_ROOT, filePath);
    console.log(`Getting file info: ${fullPath}`);
    
    // FIXED: Use query parameters for stat command
    const url = `${BOCK_API}/files/stat?arg=${encodeURIComponent(fullPath)}`;
    console.log('Request URL:', url);
    
    const response = await axios.post(url);
    
    res.json({
      success: true,
      path: fullPath,
      info: response.data
    });
  } catch (err) {
    console.error('File info error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data || err.message,
      path: fullPath 
    });
  }
});

app.get('/read-file', async (req, res) => {
  const { filePath } = req.query;
  
  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }

  try {
    const fullPath = path.posix.join(USER_ROOT, filePath);
    console.log(`Reading file: ${fullPath}`);
    
    // FIXED: Use query parameters for read command
    const url = `${BOCK_API}/files/read?arg=${encodeURIComponent(fullPath)}`;
    console.log('Request URL:', url);
    
    const response = await axios.post(url, {}, {
      responseType: 'stream'
    });
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/octet-stream');
    response.data.pipe(res);
  } catch (err) {
    console.error('Read file error:', err.response?.data || err.message);
    res.status(500).json({ 
      error: err.response?.data || err.message,
      path: fullPath 
    });
  }
});

// Initialize user directory
async function initializeUserDirectory() {
  try {
    console.log('Initializing user directory...');
    console.log(`Target directory: ${USER_ROOT}`);
    console.log(`API endpoint: ${BOCK_API}/files/mkdir`);
    
    // FIXED: Use query parameters for mkdir
    const url = `${BOCK_API}/files/mkdir?arg=${encodeURIComponent(USER_ROOT)}&parents=true`;
    console.log('Request URL:', url);
    
    const response = await axios.post(url);
    
    console.log(`✅ User directory initialized: ${USER_ROOT}`);
    console.log('Response:', response.status, response.statusText);
  } catch (error) {
    console.error('❌ Failed to initialize user directory');
    console.error('Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      url: error.config?.url
    });
    
    if (error.response?.data?.includes && error.response.data.includes('file already exists')) {
      console.log(`✅ User directory already exists: ${USER_ROOT}`);
    } else {
      console.error('This might indicate a problem with the BOCK IPFS proxy or MFS system');
      console.log('\n🔧 Troubleshooting steps:');
      console.log('1. Check if BOCK IPFS daemon is running');
      console.log('2. Test: curl -X POST http://localhost:9000/bockipfs/api/v0/version');
      console.log('3. Test: .\\bock-ipfs.exe files ls /');
      console.log('4. Test: .\\bock-ipfs.exe files mkdir --parents /users/demo');
    }
  }
};

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
  
  // Initialize user directory
  console.log('\n📋 Initializing user directory...');
  await initializeUserDirectory();
});