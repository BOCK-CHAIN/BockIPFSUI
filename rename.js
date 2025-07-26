const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

// Add some logging middleware to debug requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// API proxy (e.g., /bockipfs/api/v0/cat?arg=<CID>)
app.use('/bockipfs/api', createProxyMiddleware({
    target: 'http://localhost:5001',
    pathRewrite: { '^/bockipfs/api': '/api' },
    changeOrigin: true,
    logLevel: 'debug',
    onError: (err, req, res) => {
        console.error('API Proxy Error:', err.message);
        res.status(500).send('API Proxy Error');
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log('API Proxying:', `${req.method} ${req.url}`, '->', `${proxyReq.method} ${proxyReq.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log('API Response Status:', proxyRes.statusCode);
        if (proxyRes.statusCode === 405) {
            console.log('⚠️  405 Method Not Allowed - try using POST instead of GET for this endpoint');
        }
    }
}));

// Custom gateway handler that uses subdomain format
app.use('/bockipfs', async (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
        return next();
    }
    
    const cid = req.path.substring(1); // Remove leading slash
    console.log(`Custom Gateway Handler: ${req.method} ${req.url} -> CID: ${cid}`);
    
    // Try subdomain gateway format first
    try {
        const subdomainUrl = `http://${cid}.ipfs.localhost:8080/`;
        console.log(`Trying subdomain gateway: ${subdomainUrl}`);
        
        const fetch = require('node:fetch');
        const response = await fetch(subdomainUrl);
        
        if (response.ok) {
            console.log('✅ Subdomain gateway success');
            // Copy headers
            response.headers.forEach((value, name) => {
                res.setHeader(name, value);
            });
            res.status(response.status);
            return response.body.pipe(res);
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
        
        const fetch = require('node:fetch');
        const response = await fetch(gatewayUrl);
        
        if (response.ok) {
            console.log('✅ Path-based gateway success');
            response.headers.forEach((value, name) => {
                res.setHeader(name, value);
            });
            res.status(response.status);
            return response.body.pipe(res);
        } else {
            console.log(`❌ Path-based gateway failed with status: ${response.status}`);
        }
    } catch (error) {
        console.log(`❌ Path-based gateway error: ${error.message}`);
    }
    
    // Final fallback to API cat
    try {
        console.log(`Falling back to API cat for CID: ${cid}`);
        const fetch = require('node:fetch');
        const apiUrl = `http://localhost:5001/api/v0/cat?arg=${cid}`;
        const response = await fetch(apiUrl, { method: 'POST' });
        
        if (response.ok) {
            console.log('✅ API cat success');
            res.setHeader('Content-Type', 'text/plain');
            return response.body.pipe(res);
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
        message: 'BOCK IPFS Proxy Server',
        usage: {
            api: 'http://localhost:9000/bockipfs/api/v0/<endpoint>',
            gateway: 'http://localhost:9000/bockipfs/<CID>',
            health: 'http://localhost:9000/health'
        },
        examples: {
            version: 'http://localhost:9000/bockipfs/api/v0/version',
            id: 'http://localhost:9000/bockipfs/api/v0/id',
            gateway: 'http://localhost:9000/bockipfs/QmYourContentHashHere'
        }
    });
});

const PORT = 9000;
app.listen(PORT, () => {
    console.log(`🚀 BOCK IPFS Proxy Server running at http://localhost:${PORT}`);
    console.log(`📋 Usage guide: http://localhost:${PORT}/`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log('');
    console.log('URL Mappings:');
    console.log('  /bockipfs/api/* -> http://localhost:5001/api/*');
    console.log('  /bockipfs/* -> http://localhost:8080/ipfs/*');
});