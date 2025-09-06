import { DataTypes } from 'sequelize';
import UserModel from './User.js';
import FileModel from './File.js';

export default (sequelize) => {
  const User = UserModel(sequelize);
  const File = FileModel(sequelize);

  return sequelize.define('Share', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    file_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false, 
      references: { model: File, key: 'id' },
      onDelete: 'CASCADE'
    },
    shared_with: { 
      type: DataTypes.INTEGER, 
      allowNull: false, 
      references: { model: User, key: 'id' },
      onDelete: 'CASCADE'
    },
    permission: { 
      type: DataTypes.STRING(20), 
      allowNull: false,
      validate: { isIn: [['read', 'write']] } 
    }
  }, {
    tableName: 'shares',
    timestamps: false
  });
};
