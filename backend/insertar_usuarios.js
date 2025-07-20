const bcrypt = require('bcryptjs');
const oracledb = require('oracledb');

const dbConfig = {
  user: 'ghas',
  password: 'ghas',
  connectString: 'localhost:1521/orcl'
};

const usuarios = [
  { nombre: 'Carla Torres', contrasena: 'AdminPass123', id_rol: 1 },
  { nombre: 'Diego Gómez', contrasena: 'EditDiego456', id_rol: 2 },
  { nombre: 'Lía Martínez', contrasena: 'UserLia789', id_rol: 3 }
];

async function insertarUsuarios() {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    console.log('Conexión a Oracle establecida.');

    for (const usuario of usuarios) {
      const hash = bcrypt.hashSync(usuario.contrasena, 10);
      await connection.execute(
        `INSERT INTO usuarios (nombre, contrasena, id_rol) VALUES (:nombre, :contrasena, :id_rol)`,
        {
          nombre: usuario.nombre,
          contrasena: hash,
          id_rol: usuario.id_rol
        },
        { autoCommit: false }
      );
      console.log(`Usuario ${usuario.nombre} insertado correctamente.`);
    }

    await connection.commit();
    console.log('Todos los usuarios fueron insertados y confirmados.');
  } catch (err) {
    console.error('Error:', err);
    if (connection) {
      try {
        await connection.rollback();
        console.log('Rollback realizado.');
      } catch (rollbackErr) {
        console.error('Error en rollback:', rollbackErr);
      }
    }
  } finally {
    if (connection) {
      try {
        await connection.close();
        console.log('Conexión cerrada.');
      } catch (closeErr) {
        console.error('Error cerrando la conexión:', closeErr);
      }
    }
  }
}

insertarUsuarios();
