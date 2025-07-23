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
            `SELECT * FROM usuario WHERE nombre = :nombre AND contrasena = :contrasena`,
            { nombre, contrasena },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Usuario no encontrado' });
        } else {
            res.json({ nombre: result.rows[0].NOMBRE, rol: result.rows[0].ID_ROL });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error en el servidor' });
    } finally {
        if (connection) await connection.close();
    }
});

// REGISTRAR PACIENTE (CORREGIDO)
app.post('/pacientes', async (req, res) => {
    const {
        NOMBRE_COMPLETO, IDENTIFICACION, EDAD, GENERO, DIRECCION,
        TELEFONO, ESTADO_CIVIL, TIPO_INGRESO, ADICCION_PRINCIPAL, OBSERVACIONES
    } = req.body;

    let connection;
    try {
        connection = await openConnection();
        await connection.execute(
            `INSERT INTO paciente (
                NOMBRE_COMPLETO, IDENTIFICACION, EDAD, GENERO, DIRECCION,
                TELEFONO, ESTADO_CIVIL, FECHA_INGRESO, TIPO_INGRESO, ADICCION_PRINCIPAL, OBSERVACIONES
            ) VALUES (
                :NOMBRE_COMPLETO, :IDENTIFICACION, :EDAD, :GENERO, :DIRECCION,
                :TELEFONO, :ESTADO_CIVIL, SYSDATE, :TIPO_INGRESO, :ADICCION_PRINCIPAL, :OBSERVACIONES
            )`,
            {
                NOMBRE_COMPLETO, IDENTIFICACION, EDAD, GENERO, DIRECCION,
                TELEFONO, ESTADO_CIVIL, TIPO_INGRESO, ADICCION_PRINCIPAL, OBSERVACIONES
            },
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
    const { ID_PACIENTE, DIAGNOSTICO, MEDICAMENTOS, INDICACIONES, CONDICION_INICIAL } = req.body;
    let connection;

    try {
        connection = await openConnection();

        // Verificar si el paciente ya tiene habitación
        const checkResult = await connection.execute(
            `SELECT * FROM HABITACION WHERE ID_PACIENTE = :ID_PACIENTE`,
            { ID_PACIENTE },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (checkResult.rows.length > 0) {
            return res.status(400).json({
                error: `El paciente con ID ${ID_PACIENTE} ya tiene asignada la habitación ${checkResult.rows[0].NUMERO}`
            });
        }

        // Buscar habitación disponible con límite de 10 por piso (ejemplo)
        const roomResult = await connection.execute(
            `SELECT * FROM HABITACION 
             WHERE ESTADO = 'Disponible' 
             AND (SELECT COUNT(*) FROM HABITACION h2 WHERE h2.PISO = HABITACION.PISO AND h2.ESTADO = 'Ocupada') < 10
             FETCH FIRST 1 ROWS ONLY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (roomResult.rows.length === 0) {
            return res.json({ message: 'No hay habitaciones disponibles con el límite por piso.' });
        }

        const habitacion = roomResult.rows[0];

        // Registrar evaluación médica
        await connection.execute(
            `INSERT INTO EVALUACION_MEDICA (ID_PACIENTE, FECHA_EVALUACION, DIAGNOSTICO, MEDICAMENTOS, INDICACIONES, CONDICION_INICIAL)
             VALUES (:ID_PACIENTE, SYSDATE, :DIAGNOSTICO, :MEDICAMENTOS, :INDICACIONES, :CONDICION_INICIAL)`,
            { ID_PACIENTE, DIAGNOSTICO, MEDICAMENTOS, INDICACIONES, CONDICION_INICIAL },
            { autoCommit: true }
        );

        // Asignar habitación automáticamente
        await connection.execute(
            `UPDATE HABITACION 
             SET ESTADO = 'Ocupada', ID_PACIENTE = :ID_PACIENTE, FECHA_ASIGNACION = SYSDATE 
             WHERE ID_HABITACION = :ID_HABITACION`,
            { ID_PACIENTE, ID_HABITACION: habitacion.ID_HABITACION },
            { autoCommit: true }
        );

        res.json({ message: `Habitación ${habitacion.NUMERO} asignada automáticamente al paciente ${ID_PACIENTE}` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error registrando evaluación o asignando habitación' });
    } finally {
        if (connection) await connection.close();
    }
});

// NUEVA RUTA: ASIGNAR HABITACIÓN (para tu nuevo formulario)
app.post('/asignar/habitacion', async (req, res) => {
    const { patientId, admissionDate, dischargeDate, notes } = req.body;
    let connection;

    try {
        connection = await openConnection();

        // Buscar habitación disponible
        const roomResult = await connection.execute(
            `SELECT * FROM HABITACION WHERE ESTADO = 'Disponible' FETCH FIRST 1 ROWS ONLY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (roomResult.rows.length === 0) {
            return res.json({ success: false, message: 'No hay habitaciones disponibles.' });
        }

        const habitacion = roomResult.rows[0];

        // Asignar habitación
        await connection.execute(
            `UPDATE HABITACION
             SET ESTADO = 'Ocupada', ID_PACIENTE = :ID_PACIENTE, FECHA_ASIGNACION = TO_DATE(:FECHA_INGRESO, 'YYYY-MM-DD')
             WHERE ID_HABITACION = :ID_HABITACION`,
            { ID_PACIENTE: patientId, FECHA_INGRESO: admissionDate, ID_HABITACION: habitacion.ID_HABITACION },
            { autoCommit: true }
        );

        res.json({ success: true, message: `Habitación ${habitacion.NUMERO} asignada al paciente ${patientId}` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error asignando habitación' });
    } finally {
        if (connection) await connection.close();
    }
});

// habitaciones 
app.get('/habitaciones',async (req, res) => {

    let c;

    try{

        c = await openConnection();

        const result = await c.execute(
            `SELECT * FROM HABITACION`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener habitaciones' });
    } finally {
        if (c) await c.close();
    }
});

// pacientes 

app.get('/pacientes', async (req, res) => {

    let connection;

    try {
        connection = await openConnection();
        const result = await connection.execute(
            `SELECT * FROM PACIENTE`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener pacientes' });
    } finally {
        if (connection) await connection.close();
    }
});

app.get('/pacientes/:id' , async (req, res) => {

    let connection;
    try {
        connection = await openConnection();
        const result = await connection.execute(
            `SELECT * FROM PACIENTE WHERE ID_PACIENTE = :id`,
            [req.params.id],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener pacientes' });
    } finally {
        if (connection) await connection.close();
    }
});


app.put('/pacientes/:id' , async (req, res) => {

    let connection;
    try {
        connection = await openConnection();
        const result = await connection.execute(
            `UPDATE PACIENTE SET 
                NOMBRE_COMPLETO = :NOMBRE_COMPLETO, 
                IDENTIFICACION = :IDENTIFICACION, 
                EDAD = :EDAD, 
                GENERO = :GENERO, 
                DIRECCION = :DIRECCION, 
                TELEFONO = :TELEFONO, 
                ESTADO_CIVIL = :ESTADO_CIVIL, 
                TIPO_INGRESO = :TIPO_INGRESO, 
                ADICCION_PRINCIPAL = :ADICCION_PRINCIPAL, 
                OBSERVACIONES = :OBSERVACIONES
             WHERE ID_PACIENTE = :ID_PACIENTE`,
            {
                NOMBRE_COMPLETO: req.body.NOMBRE_COMPLETO,
                IDENTIFICACION: req.body.IDENTIFICACION,
                EDAD: req.body.EDAD,
                GENERO: req.body.GENERO,
                DIRECCION: req.body.DIRECCION,
                TELEFONO: req.body.TELEFONO,
                ESTADO_CIVIL: req.body.ESTADO_CIVIL,
                TIPO_INGRESO: req.body.TIPO_INGRESO,
                ADICCION_PRINCIPAL: req.body.ADICCION_PRINCIPAL,
                OBSERVACIONES: req.body.OBSERVACIONES,
                ID_PACIENTE: req.params.id
            },
            { autoCommit: true }
        );
        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: 'Paciente no encontrado' });
        }
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al actualizar paciente' });
    } finally {
        if (connection) await connection.close();
    }
});



// Servidor en puerto 5000
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
