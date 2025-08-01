const express = require('express');
const http = require('http');
const { URL } = require('url');
const cors = require('cors');
const app = express();

app.use(cors({
  origin: 'http://localhost:3001'
}));


// Add parsing middleware - but don't parse multipart (we'll forward it raw)
app.use('/bockipfs/api', express.raw({ type: 'multipart/form-data', limit: '50mb' }));
app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream' }));

// Add logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Helper function to make HTTP requests using built-in http module
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = http.request(requestOptions, (res) => {
            let data = Buffer.alloc(0);
            
            res.on('data', (chunk) => {
                data = Buffer.concat([data, chunk]);
            });
            
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    headers: res.headers,
                    data: data,
                    json: () => {
                        try {
                            return JSON.parse(data.toString());
                        } catch (e) {
                            return null;
                        }
                    },
                    text: () => data.toString()
                });
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (options.body) {
            if (Buffer.isBuffer(options.body)) {
                req.write(options.body);
            } else {
                req.write(options.body);
            }
        }

        req.end();
    });
}

// Manual API proxy handler
app.use('/bockipfs/api', async (req, res) => {
    try {
        // Remove /bockipfs from the path to get the IPFS API path
        const ipfsPath = req.originalUrl.replace('/bockipfs/api', '/api');
        const targetUrl = `http://localhost:5001${ipfsPath}`;
        
        console.log(`API Proxying: ${req.method} ${req.originalUrl} -> ${targetUrl}`);
        
        // Prepare headers - copy from original request
        const headers = {};
        
        // Copy important headers
        if (req.headers['content-type']) {
            headers['Content-Type'] = req.headers['content-type'];
        }
        if (req.headers['content-length']) {
            headers['Content-Length'] = req.headers['content-length'];
        }
        
        const requestOptions = {
            method: req.method,
            headers: headers
        };
        
        // Handle different body types
        if (req.method === 'POST') {
            if (req.body && req.body.length > 0) {
                // Raw body (including multipart data)
                requestOptions.body = req.body;
            }
        }
        
        const response = await makeRequest(targetUrl, requestOptions);
        
        console.log(`API Response Status: ${response.status}`);
        
        // Copy response headers
        Object.entries(response.headers).forEach(([name, value]) => {
            res.setHeader(name, value);
        });
        
        // Set status and send response
        res.status(response.status);
        
        // Handle different response types
        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('application/json')) {
            const jsonData = response.json();
            if (jsonData) {
                res.json(jsonData);
            } else {
                res.send(response.data);
            }
        } else {
            res.send(response.data);
        }
        
    } catch (error) {
        console.error('API Proxy Error:', error.message);
        res.status(500).json({ error: 'API Proxy Error', message: error.message });
    }
});

// Custom gateway handler
app.use('/bockipfs', async (req, res, next) => {
    console.log(`Gateway Handler: Processing ${req.method} ${req.url}`);
    
    // Skip API routes (they should have been handled above)
    if (req.path.startsWith('/api')) {
        console.log('  -> Skipping: This is an API route');
        return next();
    }
    
    const cid = req.path.substring(1); // Remove leading slash
    console.log(`Custom Gateway Handler: ${req.method} ${req.url} -> CID: ${cid}`);
    
    // Try subdomain gateway format first
    try {
        const subdomainUrl = `http://${cid}.ipfs.localhost:8080/`;
        console.log(`Trying subdomain gateway: ${subdomainUrl}`);
        
        const response = await makeRequest(subdomainUrl);
        
        if (response.status === 200) {
            console.log('✅ Subdomain gateway success');
            // Copy headers
            Object.entries(response.headers).forEach(([name, value]) => {
                res.setHeader(name, value);
            });
            res.status(response.status);
            return res.send(response.data);
        } else {
            console.log(`❌ Subdomain gateway failed with status: ${response.status}`);
        }
    } catch (error) {
        console.log(`❌ Subdomain gateway error: ${error.message}`);
    }
    
    // Fallback to traditional path-based gateway
    try {
        const gatewayUrl = `http://localhost:8080/ipfs${req.path}`;
        console.log(`Trying path-based gateway: ${gatewayUrl}`);
        
        const response = await makeRequest(gatewayUrl);
        
        if (response.status === 200) {
            console.log('✅ Path-based gateway success');
            Object.entries(response.headers).forEach(([name, value]) => {
                res.setHeader(name, value);
            });
            res.status(response.status);
            return res.send(response.data);
        } else {
            console.log(`❌ Path-based gateway failed with status: ${response.status}`);
        }
    } catch (error) {
        console.log(`❌ Path-based gateway error: ${error.message}`);
    }
    
    // Final fallback to API cat
    try {
        console.log(`Falling back to API cat for CID: ${cid}`);
        const apiUrl = `http://localhost:5001/api/v0/cat?arg=${cid}`;
        const response = await makeRequest(apiUrl, { method: 'POST' });
        
        if (response.status === 200) {
            console.log('✅ API cat success');
            res.setHeader('Content-Type', 'text/plain');
            return res.send(response.data);
        } else {
            console.log(`❌ API cat failed with status: ${response.status}`);
        }
    } catch (error) {
        console.log(`❌ API cat error: ${error.message}`);
    }
    
    // If everything fails, return 404
    res.status(404).send('Content not found via any method');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        services: {
            ipfsAPI: 'http://localhost:5001',
            ipfsGateway: 'http://localhost:8080'
        }
    });
});

// Root endpoint with usage instructions
app.get('/', (req, res) => {
    res.json({
        message: 'BOCK IPFS Proxy Server (Built-in HTTP)',
        usage: {
            api: 'http://localhost:9000/bockipfs/api/v0/<endpoint>',
            gateway: 'http://localhost:9000/bockipfs/<CID>',
            health: 'http://localhost:9000/health'
        },
        examples: {
            version: 'POST http://localhost:9000/bockipfs/api/v0/version',
            id: 'POST http://localhost:9000/bockipfs/api/v0/id',
            gateway: 'http://localhost:9000/bockipfs/QmYourContentHashHere'
        },
        note: 'This version uses Node.js built-in HTTP module - no external dependencies needed'
    });
});

// Catch-all 404 handler
app.use('*', (req, res) => {
    console.log(`404 Handler: No route matched for ${req.method} ${req.originalUrl}`);
    res.status(404).send('404 page not found');
});

const PORT = 9000;
app.listen(PORT, () => {
    console.log(`🚀 BOCK IPFS Proxy Server (Built-in HTTP) running at http://localhost:${PORT}`);
    console.log(`📋 Usage guide: http://localhost:${PORT}/`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log('');
    console.log('URL Mappings:');
    console.log('  /bockipfs/api/* -> http://localhost:5001/api/* (built-in HTTP)');
    console.log('  /bockipfs/* -> http://localhost:8080/ipfs/*');
    console.log('');
    console.log('✅ Using Node.js built-in HTTP module - no external fetch dependencies');
});