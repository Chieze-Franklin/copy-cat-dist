module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.createTable('TeamCreds', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      botToken: {
        allowNull: false,
        type: Sequelize.STRING
      },
      teamId: {
        allowNull: false,
        type: Sequelize.STRING
      },
      userToken: {
        allowNull: false,
        type: Sequelize.STRING
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    }),
  down: (queryInterface, Sequelize) => queryInterface.dropTable('TeamCreds')
};
