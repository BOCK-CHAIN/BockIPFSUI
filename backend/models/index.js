import sequelize from '../db.js';
import UserModel from './User.js';
import FileModel from './File.js';
import SharedFileModel from './SharedFile.js';

const User = UserModel(sequelize);
const File = FileModel(sequelize);
const SharedFile = SharedFileModel(sequelize);


// Associations
User.hasMany(File, { foreignKey: 'userId' });
File.belongsTo(User, { foreignKey: 'userId' });

File.hasMany(SharedFile, { foreignKey: 'fileId' });
SharedFile.belongsTo(File, { foreignKey: 'fileId' });

User.hasMany(SharedFile, { foreignKey: 'sharedWithUserId' });
SharedFile.belongsTo(User, { foreignKey: 'sharedWithUserId' });

export { sequelize, User, File, SharedFile };
