import { DataTypes } from 'sequelize';
import UserModel from './User.js';

export default (sequelize) => {
  const User = UserModel(sequelize);
  return sequelize.define('File', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { 
      type: DataTypes.INTEGER, 
      allowNull: false,
      references: {
        model: 'users',   // must match your users table name
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    fileName: { type: DataTypes.STRING, allowNull: false },
    fileType: { type: DataTypes.STRING },
    fileSize: { type: DataTypes.BIGINT },
    ipfsCid: { type: DataTypes.STRING, allowNull: false },
    pathInDrive: { type: DataTypes.TEXT },
    parentPath: { type: DataTypes.TEXT },        // ✅ new column
    isFolder: { type: DataTypes.BOOLEAN },       // ✅ new column
    uploadedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'files',
    timestamps: false
  });
};
