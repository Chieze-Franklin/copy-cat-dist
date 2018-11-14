export default (sequelize, DataTypes) => {
  const TeamCred = sequelize.define('TeamCred', {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: Sequelize.INTEGER
    },
    botId: {
      allowNull: false,
      type: Sequelize.STRING
    },
    botToken: {
      allowNull: false,
      type: Sequelize.STRING
    },
    teamId: {
      allowNull: false,
      type: Sequelize.STRING,
      unique: true
    },
    teamName: {
      allowNull: false,
      type: Sequelize.STRING
    },
    userId: {
      allowNull: false,
      type: Sequelize.STRING
    },
    userToken: {
      allowNull: false,
      type: Sequelize.STRING
    },
  });

  TeamCred.associate = (models) => {};

  return TeamCred;
};
