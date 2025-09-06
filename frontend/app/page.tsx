"use client";

import React, { useState, useCallback } from 'react';
import { Upload, Download, Hash, CheckCircle, AlertCircle, Copy, File, Loader2 } from 'lucide-react';

// Type definitions
interface UploadResult {
  success: boolean;
  hash?: string;
  name?: string;
  size?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  error?: string;
}

interface RetrieveResult {
  success: boolean;
  type?: 'image' | 'text' | 'file' | 'pdf';
  url?: string;
  content?: string;
  contentType?: string;
  size?: number;
  error?: string;
}

const IPFSInterface = () => {
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [retrieveHash, setRetrieveHash] = useState('');
  const [retrieveResult, setRetrieveResult] = useState<RetrieveResult | null>(null);
  const [retrieveLoading, setRetrieveLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Backend API URL
  const API_URL = 'http://localhost:4000';

  // Handle file upload using backend API
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setUploadLoading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      console.log('Uploading file:', { 
        name: file.name, 
        type: file.type, 
        size: file.size 
      });

      // Use backend upload endpoint
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          error: `HTTP ${response.status}: ${response.statusText}` 
        }));
        throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Upload result:', result);
      
      setUploadResult({
        success: true,
        hash: result.Hash,
        name: result.Name,
        size: result.Size,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      });
    } catch (error) {
      console.error('Upload error:', error);
      setUploadResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setUploadLoading(false);
    }
  };

  // Handle file selection
  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      handleFileUpload(file);
    }
  };

  // Handle drag and drop
  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadFile(file);
      handleFileUpload(file);
    }
  }, []);

  // Handle content retrieval
  const handleRetrieve = async () => {
    if (!retrieveHash.trim()) return;

    setRetrieveLoading(true);
    setRetrieveResult(null);

    try {
      const hash = retrieveHash.trim();
      console.log('Retrieving content for hash:', hash);

      // First, make a HEAD request to get content info
      const headResponse = await fetch(`${API_URL}/get-content/${hash}`, {
        method: 'HEAD'
      }).catch(() => null);

      const contentType = headResponse?.headers.get('content-type') || '';
      const contentLength = headResponse?.headers.get('content-length');
      
      console.log('Content info:', { contentType, contentLength });

      const isText = contentType.startsWith('text/') || 
                   contentType.includes('json') || 
                   contentType.includes('javascript');
      const isPdf = contentType === 'application/pdf';
      const isImage = contentType.startsWith('image/');

      if (isText && contentLength && parseInt(contentLength) < 50000) { 
        // Only read small text files
        const response = await fetch(`${API_URL}/get-content/${hash}`);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
        
        const text = await response.text();
        setRetrieveResult({
          success: true,
          type: 'text',
          content: text,
          contentType,
          size: parseInt(contentLength || '0')
        });
      } else if (isPdf) {
        // For PDFs, provide both direct URL and viewer URL
        const directUrl = `${API_URL}/get-content/${hash}`;
        
        setRetrieveResult({
          success: true,
          type: 'pdf',
          url: directUrl,
          contentType,
          size: parseInt(contentLength || '0')
        });
      } else if (isImage) {
        const url = `${API_URL}/get-content/${hash}`;
        setRetrieveResult({
          success: true,
          type: 'image',
          url,
          contentType,
          size: parseInt(contentLength || '0')
        });
      } else {
        // Generic file download
        const url = `${API_URL}/get-content/${hash}`;
        setRetrieveResult({
          success: true,
          type: 'file',
          url,
          contentType,
          size: parseInt(contentLength || '0')
        });
      }
    } catch (err) {
      console.error('Retrieve error:', err);
      setRetrieveResult({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error occurred',
      });
    } finally {
      setRetrieveLoading(false);
    }
  };

  // Copy hash to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log('Hash copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 text-white">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent">
              BOCK IPFS Interface
            </h1>
            <p className="text-xl opacity-90 max-w-2xl mx-auto">
              Upload files to IPFS and retrieve content using hash addresses through BOCK proxy server
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Upload Section */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Upload className="w-8 h-8" />
                Upload to IPFS
              </h2>
            </div>
            
            <div className="p-8">
              {/* File Upload Area */}
              <div
                className={`border-3 border-dashed rounded-xl p-12 text-center transition-all duration-300 cursor-pointer ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50 scale-105'
                    : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => {
                  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
                  fileInput?.click();
                }}
              >
                <input
                  id="fileInput"
                  type="file"
                  onChange={onFileSelect}
                  className="hidden"
                  accept="*/*"
                />
                
                {uploadLoading ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-4" />
                    <p className="text-lg text-gray-600">Uploading to IPFS...</p>
                    <p className="text-sm text-gray-500 mt-2">Please wait, this may take a moment</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="w-16 h-16 text-blue-500 mb-4" />
                    <p className="text-lg font-semibold text-gray-700 mb-2">
                      Drag & drop your file here
                    </p>
                    <p className="text-gray-500">or click to browse</p>
                    <p className="text-sm text-gray-400 mt-2">PDFs, images, documents - all supported</p>
                  </div>
                )}
              </div>

              {/* Upload Result */}
              {uploadResult && (
                <div className="mt-6">
                  {uploadResult.success ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                        <h3 className="text-lg font-semibold text-green-800">Upload Successful!</h3>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-gray-600">File Name:</label>
                          <p className="text-gray-800">{uploadResult.fileName}</p>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium text-gray-600">IPFS Hash:</label>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="bg-gray-100 px-3 py-2 rounded-lg text-sm font-mono flex-1 break-all">
                              {uploadResult.hash}
                            </code>
                            <button
                              onClick={() => copyToClipboard(uploadResult.hash || '')}
                              className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                              title="Copy Hash"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <a
                              href={`${API_URL}/get-content/${uploadResult.hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                              title="Open in New Tab"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <label className="text-gray-600">Size:</label>
                            <p className="text-gray-800">{uploadResult.fileSize ? (uploadResult.fileSize / 1024).toFixed(2) : 'Unknown'} KB</p>
                          </div>
                          <div>
                            <label className="text-gray-600">Type:</label>
                            <p className="text-gray-800">{uploadResult.fileType || 'Unknown'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-6 h-6 text-red-600" />
                        <div>
                          <h3 className="text-lg font-semibold text-red-800">Upload Failed</h3>
                          <p className="text-red-700">{uploadResult.error}</p>
                          <p className="text-sm text-red-600 mt-2">
                            Make sure BOCK IPFS is running on localhost:9000
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Retrieve Section */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-cyan-500 p-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Download className="w-8 h-8" />
                Retrieve from IPFS
              </h2>
            </div>
            
            <div className="p-8">
              {/* Hash Input */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    IPFS Hash
                  </label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={retrieveHash}
                        onChange={(e) => setRetrieveHash(e.target.value)}
                        placeholder="Enter IPFS hash (Qm... or bafy...)"
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      />
                    </div>
                    <button
                      onClick={handleRetrieve}
                      disabled={!retrieveHash.trim() || retrieveLoading}
                      className="px-6 py-3 bg-gradient-to-r from-purple-500 to-cyan-500 text-white rounded-xl hover:from-purple-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold"
                    >
                      {retrieveLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        'Retrieve'
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Retrieve Result */}
              {retrieveResult && (
                <div className="mt-6">
                  {retrieveResult.success ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <CheckCircle className="w-6 h-6 text-blue-600" />
                        <h3 className="text-lg font-semibold text-blue-800">Content Retrieved!</h3>
                      </div>
                      
                      {retrieveResult.type === 'image' && retrieveResult.url && (
                        <div className="space-y-4">
                          <img 
                            src={retrieveResult.url} 
                            alt="Retrieved content" 
                            className="max-w-full h-auto rounded-lg border border-gray-200 shadow-sm"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <a
                            href={retrieveResult.url}
                            download
                            className="inline-block px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                          >
                            Download Image
                          </a>
                        </div>
                      )}

                      {retrieveResult.type === 'pdf' && retrieveResult.url && (
                        <div className="space-y-4">
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <iframe
                              src={retrieveResult.url}
                              title="PDF Preview"
                              className="w-full h-[600px]"
                              onError={() => {
                                console.log('PDF iframe failed to load');
                              }}
                            />
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <a
                              href={retrieveResult.url}
                              download
                              className="inline-block px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                            >
                              Download PDF
                            </a>
                            <a
                              href={`${API_URL}/view-pdf/${retrieveHash.trim()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
                            >
                              Open in PDF Viewer
                            </a>
                          </div>
                          <div className="text-sm text-gray-600">
                            <p>Size: {retrieveResult.size ? (retrieveResult.size / 1024).toFixed(2) : 'Unknown'} KB</p>
                          </div>
                        </div>
                      )}
                      
                      {retrieveResult.type === 'text' && retrieveResult.content && (
                        <div className="space-y-4">
                          <div className="bg-gray-100 rounded-lg p-4 max-h-64 overflow-auto">
                            <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                              {retrieveResult.content}
                            </pre>
                          </div>
                          <button
                            onClick={() => retrieveResult.content && copyToClipboard(retrieveResult.content)}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                          >
                            Copy Content
                          </button>
                        </div>
                      )}
                      
                      {retrieveResult.type === 'file' && retrieveResult.url && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 p-4 bg-gray-100 rounded-lg">
                            <File className="w-8 h-8 text-gray-600" />
                            <div>
                              <p className="font-medium text-gray-800">File Ready for Download</p>
                              <p className="text-sm text-gray-600">
                                Type: {retrieveResult.contentType} • Size: {retrieveResult.size ? (retrieveResult.size / 1024).toFixed(2) : 'Unknown'} KB
                              </p>
                            </div>
                          </div>
                          <a
                            href={retrieveResult.url}
                            download
                            className="inline-block px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                          >
                            Download File
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-6 h-6 text-red-600" />
                        <div>
                          <h3 className="text-lg font-semibold text-red-800">Retrieval Failed</h3>
                          <p className="text-red-700">{retrieveResult.error}</p>
                          <p className="text-sm text-red-600 mt-2">
                            Make sure the hash is valid and the content exists in IPFS
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status Footer */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-lg border border-gray-200">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600">Connected via Backend API (localhost:4000) → BOCK IPFS</span>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Getting Started</h3>
          <div className="grid md:grid-cols-2 gap-6 text-sm text-gray-600">
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Prerequisites:</h4>
              <ul className="space-y-1">
                <li>• BOCK IPFS daemon running on localhost:9000</li>
                <li>• Backend API server running on localhost:4000</li>
                <li>• BOCK gateway accessible on localhost:8080</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Features:</h4>
              <ul className="space-y-1">
                <li>• Upload any file type to IPFS</li>
                <li>• Retrieve content using IPFS hashes</li>
                <li>• Built-in PDF viewer</li>
                <li>• Image preview</li>
                <li>• Text content display</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">Troubleshooting:</h4>
            <div className="text-sm text-blue-700 space-y-1">
              <p>• If uploads fail: Check BOCK daemon logs and ensure ports 9000/8080 are available</p>
              <p>• If PDFs won't display: Try the "Open in PDF Viewer" button or download directly</p>
              <p>• For large files: Increase timeout settings and file size limits</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IPFSInterface;