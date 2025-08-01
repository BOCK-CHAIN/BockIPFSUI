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
  type?: 'image' | 'text' | 'file';
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

  const PROXY_URL = 'http://localhost:9000';

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setUploadLoading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${PROXY_URL}/bockipfs/api/v0/add`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
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
      const response = await fetch(`${PROXY_URL}/bockipfs/${retrieveHash.trim()}`);
      
      if (!response.ok) {
        throw new Error(`Retrieval failed: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const isImage = contentType.startsWith('image/');
      const isText = contentType.startsWith('text/') || contentType.includes('json');

      if (isImage) {
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        setRetrieveResult({
          success: true,
          type: 'image',
          url: imageUrl,
          contentType
        });
      } else if (isText) {
        const text = await response.text();
        setRetrieveResult({
          success: true,
          type: 'text',
          content: text,
          contentType
        });
      } else {
        const blob = await response.blob();
        const fileUrl = URL.createObjectURL(blob);
        setRetrieveResult({
          success: true,
          type: 'file',
          url: fileUrl,
          contentType,
          size: blob.size
        });
      }
    } catch (error) {
      setRetrieveResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setRetrieveLoading(false);
    }
  };

  // Copy hash to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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
              Upload files to IPFS and retrieve content using hash addresses through your BOCK proxy server
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
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="w-16 h-16 text-blue-500 mb-4" />
                    <p className="text-lg font-semibold text-gray-700 mb-2">
                      Drag & drop your file here
                    </p>
                    <p className="text-gray-500">or click to browse</p>
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
                              onClick={() => uploadResult.hash && copyToClipboard(uploadResult.hash)}
                              className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                              title="Copy hash"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
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
                        placeholder="Enter IPFS hash (Qm...)"
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
                          />
                          <div className="flex gap-2">
                            <a
                              href={retrieveResult.url}
                              download
                              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                            >
                              Download Image
                            </a>
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
            <span className="text-sm text-gray-600">Connected to BOCK IPFS Proxy (localhost:9000)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IPFSInterface;