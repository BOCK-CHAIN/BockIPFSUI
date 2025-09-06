import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { sequelize, User, File, SharedFile } from './models/index.js';
import ipfs from './ipfs.js';
import axios from 'axios';
import archiver from 'archiver';
import path from 'path';
import { fileURLToPath } from 'url';
import {dirname} from 'path';

dotenv.config();


const app = express();
const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const upload = multer({ storage: multer.memoryStorage() });


// Sync DB
sequelize
  .sync({ force: true })
  .then(() => console.log('Database & tables synced'))
  .catch((err) => console.error('Error syncing DB:', err));

// Routes
app.get('/ipfs-test', async (req, res) => {
  try {
    // Add data to IPFS
    const result = await ipfs.add('Hello from IPFS!');
    const cidStr = result.cid.toString();
    console.log('CID:', cidStr);

    // Fetch content back using gateway URL from env
    const gatewayUrl = process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080/ipfs';
    const response = await axios.get(`${gatewayUrl}/${cidStr}`, { responseType: 'text' });
    
    res.json({ status: 'IPFS working', cid: cidStr, data: response.data });
  } catch (err) {
    console.error('IPFS error:', err.message);
    res.status(500).json({ error: 'IPFS connection failed', details: err.message });
  }
});

const userId = 1; // TODO: Replace with actual user ID from authentication

app.post('/fileUpload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const fileType = req.file.mimetype;
    const fileSize = req.file.size;

    
    
    // Get current directory from request body or default to user root
    const { currentPath } = req.body || '/users/1'; // Default path for userId=1
    
    // Check if user exists or create a test user
    let user;
    try {
      user = await User.findByPk(userId);
      if (!user) {
        // Create a test user if it doesn't exist
        user = await User.create({
          username: 'testuser',
          email: 'test@example.com'
        });
        console.log('Created test user:', user.id);
      }
    } catch (userErr) {
      console.error('User creation/check failed:', userErr.message);
      return res.status(500).json({ error: 'User validation failed' });
    }
    const result = await ipfs.add(fileBuffer);
    const cidStr = result.cid.toString(); 
    console.log('Uploaded to IPFS with CID:', cidStr);
    
    // Determine upload path based on current directory
    const userRootPath = `/users/${user.id}`;
    let targetPath = (currentPath || userRootPath).trim();
    targetPath = targetPath.replace(/\/+/g, '/'); // collapse double slashes
    console.log("userRootPath:", userRootPath);
    console.log("targetPath:", targetPath);

    // Security check AFTER cleanup
    if (!targetPath.startsWith(userRootPath)) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }
    
    // Clean up the target path (remove double slashes, etc.)
    targetPath = targetPath.replace(/\/+/g, '/');
    
    // Create full file path
    const fileMfsPath = `${targetPath}/${fileName}`.replace(/\/+/g, '/');
    
    console.log(`Uploading to directory: ${targetPath}`);
    console.log(`Full file path: ${fileMfsPath}`);
    
    try {
        await ipfs.files.mkdir(targetPath, { parents: true });
    } catch (mkdirErr) {
        if (!mkdirErr.message.includes('file already exists')) {
            throw mkdirErr;
        }
    }
    
    try {
        // ✅ Use backticks for template literals
        await ipfs.files.cp(`/ipfs/${cidStr}`, fileMfsPath);
        console.log(`File copied to MFS at: ${fileMfsPath}`);
    } catch (cpErr) {
        if (cpErr.message.includes('file already exists') || 
            cpErr.message.includes('directory already has entry by that name')) {
            await ipfs.files.rm(fileMfsPath);
            // ✅ Use backticks for template literals
            await ipfs.files.cp(`/ipfs/${cidStr}`, fileMfsPath);
            console.log(`File already existed. Overwritten in MFS at: ${fileMfsPath}`);
        } else {
            throw cpErr;
        }
    }
    
    const dbRecord = await File.create({
      userId: user.id,          // Use the actual user ID
      fileName: fileName,
      fileType: fileType,
      fileSize: fileSize,
      ipfsCid: cidStr,
      pathInDrive: fileMfsPath,
      parentPath: targetPath,   // Use the target directory as parent
      isFolder: false,
      uploadedAt: new Date()
    });
    
    res.json({
      status: 'success',
      message: 'File uploaded to IPFS and metadata saved in DB',
      data: {
        cid: cidStr,
        mfsPath: fileMfsPath,
        file: dbRecord
      }
    });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'File upload failed', details: err.message });
  }
});

app.post('/createFolder', async (req, res) => {
  try {
    const { currentPath, newFolderName } = req.body;

    if (!currentPath || !newFolderName.trim()) {
      return res.status(400).json({ error: 'Current path and Folder name is required' });
    }

    // extract userId from the path
    const match = currentPath.match(/^\/users\/(\d+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid path format' });
    }
    const userId = match[1];

    // check if user exists, otherwise create a test one
    let user;
    try {
      user = await User.findByPk(userId);
      if (!user) {
        user = await User.create({
          username: 'testuser',
          email: 'test@example.com'
        });
        console.log('Created test user:', user.id);
      }
    } catch (userErr) {
      console.error('User creation/check failed:', userErr.message);
      return res.status(500).json({ error: 'User validation failed' });
    }

    // build normalized MFS path
    const mfsPath = `${currentPath}/${newFolderName.trim()}`.replace(/\/+/g, '/');

    console.log('Creating folder at MFS path:', mfsPath);

    try {
      await ipfs.files.mkdir(mfsPath, { parents: true });
    } catch (mkdirErr) {
      if (!mkdirErr.message.includes('file already exists')) {
        throw mkdirErr;
      }
    }

    const stats = await ipfs.files.stat(mfsPath);
    const cid = stats.cid.toString();
    console.log('Folder created with CID:', cid);

    // ✅ Use File model instead of raw SQL
    const dbRecord = await File.create({
      userId: user.id,
      fileName: newFolderName.trim(),
      fileType: null,
      fileSize: 0,
      ipfsCid: cid,
      pathInDrive: mfsPath,
      parentPath: currentPath,
      isFolder: true,
      uploadedAt: new Date()
    });

    return res.json({
      message: 'Folder created successfully',
      folderId: dbRecord.id,
      cid,
      path: mfsPath
    });
  } catch (err) {
    console.error('Create folder error:', err.message);
    res.status(500).json({ error: 'Create folder failed', details: err.message });
  }
});


app.get('/download/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    const fileRecord = await File.findByPk(fileId);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found' });
    }

    const mfsPath = fileRecord.pathInDrive;
    const isFolder = fileRecord.isFolder;

    if (isFolder) {
      // ---------- Handle folder download ----------
      res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.fileName}.zip"`);
      res.setHeader('Content-Type', 'application/zip');

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', err => { throw err; });
      archive.pipe(res);

      const addFolderToArchive = async (folderPath, zipPath) => {
        for await (const entry of ipfs.files.ls(folderPath)) {
          const entryMfsPath = `${folderPath}/${entry.name}`.replace(/\/+/g, '/');
          const entryZipPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;

          if (entry.type === 'directory') {
            await addFolderToArchive(entryMfsPath, entryZipPath);
          } else {
            const chunks = [];
            for await (const chunk of ipfs.files.read(entryMfsPath)) {
              chunks.push(chunk);
            }
            archive.append(Buffer.concat(chunks), { name: entryZipPath });
          }
        }
      };

      await addFolderToArchive(mfsPath, fileRecord.fileName); // nested inside zip with folder name
      await archive.finalize();

    } else {
      // ---------- Handle single file download ----------
      const stat = await ipfs.files.stat(mfsPath);
      res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.fileName}"`);
      res.setHeader('Content-Type', fileRecord.fileType || 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);

      const chunks = [];
      for await (const chunk of ipfs.files.read(mfsPath)) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      res.send(buffer);
    }
  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed', details: err.message });
    }
  }
});

// List files and folders in current path
app.post('/list', async (req, res) => {
  try {
    const { userId, currentPath } = req.body; // Extract both userId and currentPath
    
    if (!userId || !currentPath) {
      return res.status(400).json({ error: 'userId and currentPath are required' });
    }
    
    // Ensure path is always prefixed with /users/<userId>
    if (!currentPath.startsWith(`/users/${userId}`)) {
      return res.status(400).json({ error: 'Invalid path for user' });
    }
    
    // Read from IPFS MFS (only current folder contents)
    const entries = [];
    for await (const entry of ipfs.files.ls(currentPath)) {
      entries.push({
        name: entry.name,
        type: entry.type === 'directory' ? 'folder' : 'file',
        cid: entry.cid.toString()
      });
    }
    
    // Pull DB entries that are exactly in this directory (not deeper)
    const [dbEntries] = await sequelize.query(
      `SELECT id, "fileName", "ipfsCid", "isFolder", "pathInDrive", "uploadedAt" 
       FROM files 
       WHERE "userId" = :userId 
        AND "pathInDrive" LIKE :pathPrefix 
        AND "pathInDrive" NOT LIKE :deeperPath`,
      {
        replacements: { 
          userId,
          pathPrefix: `${currentPath}/%`,    // children
          deeperPath: `${currentPath}/%/%`   // filter out deeper nested paths
        }
      }
    );
    
    return res.json({
      path: currentPath,
      entries,
      dbEntries
    });
    
  } catch (error) {
    console.error('Error listing files:', error);
    return res.status(500).json({ error: 'Failed to list files/folders' });
  }
});



app.post('/rename', async (req, res) => {
  try {
    const {oldPath, newName } = req.body;
    
    if (!userId || !oldPath || !newName) {
      return res.status(400).json({ error: 'userId, oldPath, and newName are required' });
    }
    
    // Validate that the old path belongs to the user
    if (!oldPath.startsWith(`/users/${userId}`)) {
      return res.status(400).json({ error: 'Invalid path for user' });
    }
    
    // Validate new name (no slashes, no empty string)
    
    
    // Extract parent directory and old name from path
    const pathParts = oldPath.split('/');
    const oldName = pathParts[pathParts.length - 1];
    const parentPath = pathParts.slice(0, -1).join('/');
    const newPath = `${parentPath}/${newName}`;
    
    // Check if new name already exists in the same directory
    try {
      await ipfs.files.stat(newPath);
      return res.status(409).json({ error: 'A file or folder with that name already exists' });
    } catch (error) {
      // If stat fails, the path doesn't exist (which is what we want)
      // Handle different error types that indicate "not found"
      if (error.name !== 'HTTPError' && error.code !== 'ERR_NOT_FOUND') {
        throw error;
      }
    }
    
    // Check if the old path exists in IPFS MFS
    let oldStat;
    try {
      oldStat = await ipfs.files.stat(oldPath);
    } catch (error) {
      return res.status(404).json({ error: 'File or folder not found' });
    }
    
    // Perform the rename operation in IPFS MFS
    await ipfs.files.mv(oldPath, newPath);
    
    // Update database records
    const isFolder = oldStat.type === 'directory';
    
    if (isFolder) {
      // For folders, update all files/subfolders that have paths starting with the old path
      await sequelize.query(
        `UPDATE files 
         SET "fileName" = :newName,
             "pathInDrive" = REPLACE("pathInDrive", :oldPath, :newPath),
             "parentPath" = CASE 
               WHEN "pathInDrive" = :oldPath THEN :parentPath
               ELSE REPLACE("parentPath", :oldPath, :newPath)
             END
         WHERE "userId" = :userId 
           AND ("pathInDrive" = :oldPath OR "pathInDrive" LIKE :oldPathPrefix)`,
        {
          replacements: {
            userId,
            newName,
            oldPath,
            newPath,
            parentPath,
            oldPathPrefix: `${oldPath}/%`
          }
        }
      );
    } else {
      // For files, update only the specific file record
      await sequelize.query(
        `UPDATE files 
         SET "fileName" = :newName,
             "pathInDrive" = :newPath
         WHERE "userId" = :userId 
           AND "pathInDrive" = :oldPath`,
        {
          replacements: {
            userId,
            newName,
            newPath,
            oldPath
          }
        }
      );
    }
    
    return res.json({
      success: true,
      message: `${isFolder ? 'Folder' : 'File'} renamed successfully`,
      oldPath,
      newPath,
      newName
    });
    
  } catch (error) {
    console.error('Error renaming file/folder:', error);
    
    // Try to rollback IPFS operation if database update failed
    if (error.name === 'SequelizeDatabaseError') {
      try {
        // Attempt to rename back in IPFS
        const { oldPath, newName } = req.body;
        const pathParts = oldPath.split('/');
        const parentPath = pathParts.slice(0, -1).join('/');
        const newPath = `${parentPath}/${newName}`;
        await ipfs.files.mv(newPath, oldPath);
        console.log('Rolled back IPFS rename operation');
      } catch (rollbackError) {
        console.error('Failed to rollback IPFS operation:', rollbackError);
      }
    }
    
    return res.status(500).json({ error: 'Failed to rename file/folder' });
  }
});

// Add this to your index.js file with your other endpoints

app.post('/search', async (req, res) => {
  try {
    const { searchPath, query, recursive = true, fileType = null } = req.body;
    
    if ( !searchPath || !query) {
      return res.status(400).json({ error: 'userId, searchPath, and query are required' });
    }
    
    // Validate that the search path belongs to the user
    if (!searchPath.startsWith(`/users/${userId}`)) {
      return res.status(400).json({ error: 'Invalid search path for user' });
    }
    
    // Validate search query (minimum length, no dangerous characters)
    const cleanQuery = query.trim();
    if (cleanQuery.length < 1) {
      return res.status(400).json({ error: 'Search query must be at least 1 character long' });
    }
    
    // Check if search path exists in IPFS MFS
    try {
      const pathStat = await ipfs.files.stat(searchPath);
      if (pathStat.type !== 'directory') {
        return res.status(400).json({ error: 'Search path must be a directory' });
      }
    } catch (error) {
      if (error.name === 'HTTPError' || error.code === 'ERR_NOT_FOUND') {
        return res.status(404).json({ error: 'Search directory not found' });
      }
      throw error;
    }
    
    // Search in IPFS MFS
    const ipfsResults = [];
    
    async function searchDirectory(currentPath, depth = 0) {
      try {
        for await (const entry of ipfs.files.ls(currentPath)) {
          const entryPath = `${currentPath}/${entry.name}`;
          
          // Check if entry name matches search query (case-insensitive)
          const nameMatches = entry.name.toLowerCase().includes(cleanQuery.toLowerCase());
          
          if (nameMatches) {
            // Check file type filter if specified
            const entryType = entry.type === 'directory' ? 'folder' : 'file';
            if (!fileType || fileType === 'all' || fileType === entryType) {
              ipfsResults.push({
                name: entry.name,
                path: entryPath,
                type: entryType,
                cid: entry.cid.toString(),
                depth: depth + 1,
                relativePath: entryPath.replace(searchPath, '').replace(/^\//, '') || entry.name
              });
            }
          }
          
          // Recursively search subdirectories if recursive is enabled
          if (recursive && entry.type === 'directory') {
            await searchDirectory(entryPath, depth + 1);
          }
        }
      } catch (error) {
        console.warn(`Could not search directory ${currentPath}:`, error.message);
      }
    }
    
    await searchDirectory(searchPath);
    
    // Search in database records
    let dbQuery = `
      SELECT id, "fileName", "ipfsCid", "isFolder", "pathInDrive", "fileType", "fileSize", "uploadedAt"
      FROM files 
      WHERE "userId" = :userId 
        AND "fileName" ILIKE :searchQuery
    `;
    
    const queryReplacements = {
      userId,
      searchQuery: `%${cleanQuery}%`
    };
    
    // Add path filtering
    if (recursive) {
      dbQuery += ` AND ("pathInDrive" LIKE :pathPrefix OR "pathInDrive" = :exactPath)`;
      queryReplacements.pathPrefix = `${searchPath}/%`;
      queryReplacements.exactPath = searchPath;
    } else {
      dbQuery += ` AND "parentPath" = :parentPath`;
      queryReplacements.parentPath = searchPath;
    }
    
    // Add file type filtering
    if (fileType && fileType !== 'all') {
      if (fileType === 'folder') {
        dbQuery += ` AND "isFolder" = true`;
      } else if (fileType === 'file') {
        dbQuery += ` AND "isFolder" = false`;
      }
    }
    
    dbQuery += ` ORDER BY "fileName" ASC`;
    
    const [dbResults] = await sequelize.query(dbQuery, {
      replacements: queryReplacements
    });
    
    // Combine and deduplicate results
    const combinedResults = new Map();
    
    // Add IPFS results
    ipfsResults.forEach(result => {
      const key = result.path;
      if (!combinedResults.has(key)) {
        combinedResults.set(key, {
          ...result,
          source: 'ipfs',
          hasDbRecord: false
        });
      }
    });
    
    // Add/merge database results
    dbResults.forEach(dbResult => {
      const key = dbResult.pathInDrive;
      if (combinedResults.has(key)) {
        // Merge with existing IPFS result
        const existing = combinedResults.get(key);
        combinedResults.set(key, {
          ...existing,
          source: 'both',
          hasDbRecord: true,
          dbInfo: {
            id: dbResult.id,
            fileType: dbResult.fileType,
            fileSize: dbResult.fileSize,
            uploadedAt: dbResult.uploadedAt
          }
        });
      } else {
        // Add database-only result
        const pathParts = dbResult.pathInDrive.split('/');
        const relativePath = dbResult.pathInDrive.replace(searchPath, '').replace(/^\//, '') || pathParts[pathParts.length - 1];
        
        combinedResults.set(key, {
          name: dbResult.fileName,
          path: dbResult.pathInDrive,
          type: dbResult.isFolder ? 'folder' : 'file',
          cid: dbResult.ipfsCid,
          relativePath,
          source: 'database',
          hasDbRecord: true,
          dbInfo: {
            id: dbResult.id,
            fileType: dbResult.fileType,
            fileSize: dbResult.fileSize,
            uploadedAt: dbResult.uploadedAt
          }
        });
      }
    });
    
    // Convert map to array and sort by relevance
    const finalResults = Array.from(combinedResults.values())
      .sort((a, b) => {
        // Sort by: exact match first, then by depth (closer to search path), then alphabetically
        const aExactMatch = a.name.toLowerCase() === cleanQuery.toLowerCase();
        const bExactMatch = b.name.toLowerCase() === cleanQuery.toLowerCase();
        
        if (aExactMatch && !bExactMatch) return -1;
        if (!aExactMatch && bExactMatch) return 1;
        
        if (a.depth !== b.depth) return (a.depth || 0) - (b.depth || 0);
        
        return a.name.localeCompare(b.name);
      });
    
    return res.json({
      success: true,
      searchQuery: cleanQuery,
      searchPath,
      recursive,
      fileType: fileType || 'all',
      totalResults: finalResults.length,
      results: finalResults
    });
    
  } catch (error) {
    console.error('Error searching files/folders:', error);
    return res.status(500).json({ 
      error: 'Failed to search files/folders',
      details: error.message 
    });
  }
});



app.listen(PORT, () => {
  console.log(`Backend is running on http://localhost:${PORT}`);
});
