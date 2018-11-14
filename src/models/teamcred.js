export default (sequelize, DataTypes) => {
  const TeamCred = sequelize.define('TeamCred', {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER
    },
    botId: {
      allowNull: false,
      type: DataTypes.STRING
    },
    botToken: {
      allowNull: false,
      type: DataTypes.STRING
    },
    teamId: {
      allowNull: false,
      type: DataTypes.STRING,
      unique: true
    },
    teamName: {
      allowNull: false,
      type: DataTypes.STRING
    },
    teamUrl: {
      allowNull: false,
      type: DataTypes.STRING
    },
    userId: {
      allowNull: false,
      type: DataTypes.STRING
    },
    userToken: {
      allowNull: false,
      type: DataTypes.STRING
    },
  });

  TeamCred.associate = (models) => {};

  return TeamCred;
};
