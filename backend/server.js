const express = require('express');
const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

// Configuración de Oracle
async function openConnection() {
    return await oracledb.getConnection({
        user: 'ghas',
        password: 'ghas',
        connectString: 'localhost/orcl'
    });
}

// LOGIN
app.post('/login', async (req, res) => {
    const { nombre, contrasena } = req.body;
    let connection;
    try {
        connection = await openConnection();
        const result = await connection.execute(
            `SELECT * FROM usuario WHERE nombre = :nombre and contrasena = :contrasena`,
            { nombre, contrasena },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (result.rows.length === 0){
            return res.status(400).json({ error: 'Usuario no encontrado' });
        }
        else{

            res.json({ nombre: result.rows[0].NOMBRE, rol: result.rows[0].ID_ROL });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error en el servidor' });
    } finally {
        if (connection) await connection.close();
    }
});

// REGISTRAR PACIENTE
app.post('/pacientes', async (req, res) => {
   
    const { NOMBRE_COMPLETO, IDENTIFICACION, EDAD, GENERO, DIRECCION, TELEFONO, ESTADO_CIVIL, FECHA_INGRESO, TIPO_INGRESO, ADICCION_PRINCIPAL,OBSERVACIONES} = req.body;
    
    
    let connection;
    try {
        connection = await openConnection();
        await connection.execute(
            `INSERT INTO paciente (NOMBRE_COMPLETO, identificacion, edad, genero, direccion, telefono, estado_civil, fecha_ingreso, tipo_ingreso, adiccion_principal, observaciones)
             VALUES ( :NOMBRE_COMPLETO, :identificacion, :edad, :genero, :direccion, :telefono, :estado_civil, SYSDATE, :tipo_ingreso, :adiccion_principal, :observaciones)`,
            { NOMBRE_COMPLETO, IDENTIFICACION, EDAD, GENERO, DIRECCION, TELEFONO, ESTADO_CIVIL, TIPO_INGRESO, ADICCION_PRINCIPAL, OBSERVACIONES },
            { autoCommit: true }
        );
        res.json({ message: 'Paciente registrado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error registrando paciente' });
    } finally {
        if (connection) await connection.close();
    }
});

// REGISTRAR EVALUACION Y ASIGNAR HABITACION
app.post('/evaluaciones', async (req, res) => {
    const { id_paciente, diagnostico, medicamentos, indicaciones, condicion_inicial } = req.body;
    let connection;
    try {
        connection = await openConnection();
        await connection.execute(
            `INSERT INTO evaluaciones (id_paciente, fecha_evaluacion, diagnostico, medicamentos, indicaciones, condicion_inicial)
             VALUES (:id_paciente, SYSDATE, :diagnostico, :medicamentos, :indicaciones, :condicion_inicial)`,
            { id_paciente, diagnostico, medicamentos, indicaciones, condicion_inicial },
            { autoCommit: true }
        );

        const result = await connection.execute(
            `SELECT * FROM habitacion WHERE estado = 'LIBRE' FETCH FIRST 1 ROWS ONLY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.json({ message: 'Evaluación registrada, pero no hay habitaciones libres' });
        }

        const habitacion = result.rows[0];

        await connection.execute(
            `UPDATE habitacion SET estado = 'OCUPADO', id_paciente = :id_paciente, fecha_asignacion = SYSDATE WHERE id_habitacion = :id_habitacion`,
            { id_paciente, id_habitacion: habitacion.ID_HABITACION },
            { autoCommit: true }
        );

        res.json({ message: `Evaluación registrada y habitación ${habitacion.NUMERO} asignada` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error registrando evaluación o asignando habitación' });
    } finally {
        if (connection) await connection.close();
    }
});

app.get('/habitaciones', async (req, res) => {
    let connection;
    try {
        connection = await openConnection();
        const result = await connection.execute(
            `SELECT * FROM habitacion`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error obteniendo habitaciones' });
    } finally {
        if (connection) await connection.close();
    }
});

app.listen(5000, () => console.log('Servidor Node.js corriendo en puerto 5000'));
