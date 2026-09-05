const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const multer = require('multer');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
app.use(express.static('./')); 

const PORT = process.env.PORT || 3000;

const dbConfig = {
    user: 'sa', // Nota de QA: Azure restringe usar 'sa' por defecto. Si te rechaza el login, reemplázalo por el usuario administrador que creaste en Azure.
    password: 'Sviet11062023*', 
    server: 'sgp-systems-db-server.database.windows.net',
    database: 'SistemaTransparencia',
    options: {
        encrypt: true, 
        trustServerCertificate: false 
    }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads'); 
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { files: 3 } 
});

function verificarRolAdmin(req, res, next) {
    const rol = req.headers['x-user-rol'];
    if (rol && rol.toLowerCase() === 'administrador') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Acceso denegado: Solo el Administrador puede realizar esta acción.' });
    }
}

function calcularSemaforo(fechaVencimiento, estado, periodicidad) {
    if (estado === 'CUMPLIDO') return 'CUMPLIDO';
    
    const hoy = new Date();
    const mesActual = hoy.getMonth(); 

    if (periodicidad && periodicidad.toUpperCase() === 'ANUAL') {
        if (mesActual === 10) return 'AMARILLO';
        else if (mesActual === 11) return 'ROJO';
        else return 'VERDE';
    }

    hoy.setHours(0, 0, 0, 0);
    const vencimiento = new Date(fechaVencimiento);
    vencimiento.setHours(0, 0, 0, 0);

    const diferenciaDias = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));

    if (diferenciaDias < 0) return 'ROJO';
    if (diferenciaDias <= 3) return 'AMARILLO';
    return 'VERDE';
}

// Ruta raíz configurada para servir directamente la interfaz de Login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/api/login', async (req, res) => {
    const usuario = req.body.usuario || req.body.username;
    const contrasena = req.body.contrasena || req.body.password;
    
    if (!usuario || !contrasena) {
        return res.json({ success: false, message: 'Faltan datos de usuario o contraseña' });
    }

    try {
        let pool = await sql.connect(dbConfig);
        
        let result = await pool.request()
            .input('Usuario', sql.VarChar, usuario.trim())
            .input('Password', sql.VarChar, contrasena.trim())
            .query('SELECT * FROM Usuarios WHERE LTRIM(RTRIM(Usuario)) = @Usuario AND LTRIM(RTRIM(Password)) = @Password');

        if (result.recordset.length > 0) {
            res.json({ success: true, usuario: result.recordset[0] });
        } else {
            res.json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }
    } catch (err) {
        console.error("ERROR DETALLADO EN LOGIN:", err);
        res.status(500).json({ success: false, message: 'Error de BD: ' + err.message });
    }
});

app.get('/api/oficinas', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query('SELECT * FROM Oficinas WHERE Activo = 1 ORDER BY NombreOficina ASC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/oficinas', verificarRolAdmin, async (req, res) => {
    const { nombreOficina, responsable, telefonoResponsable, responsable2 } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('NombreOficina', sql.VarChar, nombreOficina)
            .input('Responsable', sql.VarChar, responsable || null)
            .input('TelefonoResponsable', sql.VarChar, telefonoResponsable || null)
            .input('Responsable2', sql.VarChar, responsable2 || null)
            .query('INSERT INTO Oficinas (NombreOficina, Responsable, TelefonoResponsable, Responsable2, Activo) VALUES (@NombreOficina, @Responsable, @TelefonoResponsable, @Responsable2, 1)');
        res.json({ success: true, message: 'Oficina agregada correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/oficinas/:id', verificarRolAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombreOficina, responsable, telefonoResponsable, responsable2 } = req.body;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Id', sql.Int, id)
            .input('NombreOficina', sql.VarChar, nombreOficina)
            .input('Responsable', sql.VarChar, responsable || null)
            .input('TelefonoResponsable', sql.VarChar, telefonoResponsable || null)
            .input('Responsable2', sql.VarChar, responsable2 || null)
            .query('UPDATE Oficinas SET NombreOficina = @NombreOficina, Responsable = @Responsable, TelefonoResponsable = @TelefonoResponsable, Responsable2 = @Responsable2 WHERE Id = @Id');
        res.json({ success: true, message: 'Oficina actualizada correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/oficinas/:id', verificarRolAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request()
            .input('Id', sql.Int, id)
            .query('UPDATE Oficinas SET Activo = 0 WHERE Id = @Id');
        res.json({ success: true, message: 'Oficina desactivada correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/entregas/pendientes', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT o.*, ofic.NombreOficina, ofic.Responsable 
            FROM Obligaciones o
            INNER JOIN Oficinas ofic ON o.OficinaId = ofic.Id
            WHERE o.Estado = 'PENDIENTE'
            ORDER BY o.FechaVencimiento ASC
        `);

        const entregasConSemaforo = result.recordset.map(item => {
            const semaforo = calcularSemaforo(item.FechaVencimiento, item.Estado, item.Periodicidad);
            return { ...item, Semaforo: semaforo };
        });

        res.json({ success: true, entregas: entregasConSemaforo });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/entregas/historial', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT o.*, ofic.NombreOficina, ofic.Responsable 
            FROM Obligaciones o
            INNER JOIN Oficinas ofic ON o.OficinaId = ofic.Id
            WHERE o.Estado = 'CUMPLIDO'
            ORDER BY o.FechaCarga DESC
        `);
        res.json({ success: true, entregas: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/entregas/nueva', verificarRolAdmin, upload.array('archivosDocumentos', 3), async (req, res) => {
    const usuarioGestion = req.headers['x-user-rol'] || req.body.usuarioGestion || 'Administrador';
    const {
        oficinaId, tituloInformacion, portalPTE, portalPTI,
        periodoInformacion, tipoDocumento, numeroDocumento,
        fechaSolicitud, periodicidad, fechaVencimiento, enlace
    } = req.body;

    let nombresArchivos = req.body.nombresArchivos || [];
    if (!Array.isArray(nombresArchivos)) nombresArchivos = [nombresArchivos];

    const pteVal = portalPTE === 'true' || portalPTE === '1' ? 1 : 0;
    const ptiVal = portalPTI === 'true' || portalPTI === '1' ? 1 : 0;

    if (!pteVal && !ptiVal) {
        return res.status(400).json({ success: false, message: 'Debe seleccionar al menos un Portal (PTE o PTI).' });
    }

    let arrUrls = [];
    if (enlace && enlace.trim() !== '') {
        arrUrls.push(`Ver enlace de la Información|${enlace.trim()}`);
    }
    
    if (req.files && req.files.length > 0) {
        req.files.forEach((file, index) => {
            let tituloDefinido = nombresArchivos[index] && nombresArchivos[index].trim() !== '' ? nombresArchivos[index] : `Documento ${index + 1}`;
            arrUrls.push(`${tituloDefinido}|${file.path.replace(/\\/g, '/')}`);
        });
    }
    
    let urlsArchivos = arrUrls.length > 0 ? arrUrls.join(',') : null;

    try {
        let pool = await sql.connect(dbConfig);
        const esAutomatico = periodicidad && periodicidad.toUpperCase() === 'AUTOMATICO';
        const estadoInicial = esAutomatico ? 'CUMPLIDO' : 'PENDIENTE';
        const fechaCargaVal = esAutomatico ? new Date() : null;
        const semaforoVal = esAutomatico ? 'CUMPLIDO' : calcularSemaforo(fechaVencimiento, 'PENDIENTE', periodicidad);

        await pool.request()
            .input('OficinaId', sql.Int, oficinaId)
            .input('TituloInformacion', sql.VarChar, tituloInformacion)
            .input('PortalPTE', sql.Bit, pteVal)
            .input('PortalPTI', sql.Bit, ptiVal)
            .input('PeriodoInformacion', sql.VarChar, periodoInformacion)
            .input('TipoDocumento', sql.VarChar, tipoDocumento)
            .input('NumeroDocumento', sql.VarChar, numeroDocumento || null)
            .input('FechaSolicitud', sql.Date, fechaSolicitud)
            .input('Periodicidad', sql.VarChar, periodicidad)
            .input('FechaVencimiento', sql.Date, fechaVencimiento)
            .input('Url', sql.VarChar, urlsArchivos)
            .input('Estado', sql.VarChar, estadoInicial)
            .input('FechaCarga', sql.DateTime, fechaCargaVal)
            .input('Semaforo', sql.VarChar, semaforoVal)
            .input('UsuarioGestion', sql.VarChar, usuarioGestion)
            .query(`
                INSERT INTO Obligaciones 
                (OficinaId, TituloInformacion, PortalPTE, PortalPTI, PeriodoInformacion, TipoDocumento, NumeroDocumento, FechaSolicitud, Periodicidad, FechaVencimiento, Url, Estado, FechaCarga, Semaforo, UsuarioGestion) 
                VALUES 
                (@OficinaId, @TituloInformacion, @PortalPTE, @PortalPTI, @PeriodoInformacion, @TipoDocumento, @NumeroDocumento, @FechaSolicitud, @Periodicidad, @FechaVencimiento, @Url, @Estado, @FechaCarga, @Semaforo, @UsuarioGestion)
            `);

        const mensajeExito = esAutomatico 
            ? 'Información automática registrada directamente en el Historial de Cumplimiento.' 
            : 'Información y obligación programada con éxito.';

        res.json({ success: true, message: mensajeExito });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error en servidor: ' + err.message });
    }
});

app.put('/api/entregas/:id', verificarRolAdmin, upload.array('archivosDocumentos', 3), async (req, res) => {
    const { id } = req.params;
    const usuarioGestion = req.headers['x-user-rol'] || req.body.usuarioGestion || 'Administrador';
    const {
        oficinaId, tituloInformacion, portalPTE, portalPTI,
        periodoInformacion, tipoDocumento, numeroDocumento,
        fechaSolicitud, periodicidad, fechaVencimiento, enlace
    } = req.body;

    let nombresArchivos = req.body.nombresArchivos || [];
    if (!Array.isArray(nombresArchivos)) nombresArchivos = [nombresArchivos];

    const pteVal = portalPTE === 'true' || portalPTE === '1' ? 1 : 0;
    const ptiVal = portalPTI === 'true' || portalPTI === '1' ? 1 : 0;

    try {
        let pool = await sql.connect(dbConfig);
        let arrUrls = [];
        let finalUrls = null;

        if (enlace && enlace.trim() !== '') {
            arrUrls.push(`Ver enlace de la Información|${enlace.trim()}`);
        }

        if (req.files && req.files.length > 0) {
            req.files.forEach((file, index) => {
                let tituloDefinido = nombresArchivos[index] && nombresArchivos[index].trim() !== '' ? nombresArchivos[index] : `Documento ${index + 1}`;
                arrUrls.push(`${tituloDefinido}|${file.path.replace(/\\/g, '/')}`);
            });
            finalUrls = arrUrls.length > 0 ? arrUrls.join(',') : null;
        } else {
            let existing = await pool.request().input('Id', sql.Int, id).query('SELECT Url FROM Obligaciones WHERE Id = @Id');
            if (existing.recordset.length > 0 && existing.recordset[0].Url) {
                let oldUrls = existing.recordset[0].Url.split(',');
                let oldFiles = oldUrls.filter(u => {
                    let text = u.includes('|') ? u.split('|')[1] : u;
                    return !text.startsWith('http') && !text.startsWith('www');
                });
                if (oldFiles.length > 0) arrUrls.push(...oldFiles);
            }
            finalUrls = arrUrls.length > 0 ? arrUrls.join(',') : null;
        }

        await pool.request()
            .input('Id', sql.Int, id)
            .input('OficinaId', sql.Int, oficinaId)
            .input('TituloInformacion', sql.VarChar, tituloInformacion)
            .input('PortalPTE', sql.Bit, pteVal)
            .input('PortalPTI', sql.Bit, ptiVal)
            .input('PeriodoInformacion', sql.VarChar, periodoInformacion)
            .input('TipoDocumento', sql.VarChar, tipoDocumento)
            .input('NumeroDocumento', sql.VarChar, numeroDocumento || null)
            .input('FechaSolicitud', sql.Date, fechaSolicitud)
            .input('Periodicidad', sql.VarChar, periodicidad)
            .input('FechaVencimiento', sql.Date, fechaVencimiento)
            .input('Url', sql.VarChar, finalUrls)
            .input('UsuarioGestion', sql.VarChar, usuarioGestion)
            .query(`
                UPDATE Obligaciones 
                SET OficinaId = @OficinaId, TituloInformacion = @TituloInformacion, PortalPTE = @PortalPTE, PortalPTI = @PortalPTI, PeriodoInformacion = @PeriodoInformacion, TipoDocumento = @TipoDocumento, NumeroDocumento = @NumeroDocumento, FechaSolicitud = @FechaSolicitud, Periodicidad = @Periodicidad, FechaVencimiento = @FechaVencimiento, Url = @Url, UsuarioGestion = @UsuarioGestion
                WHERE Id = @Id
            `);
        res.json({ success: true, message: 'Obligación actualizada correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/entregas/:id', verificarRolAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        let pool = await sql.connect(dbConfig);
        await pool.request().input('Id', sql.Int, id).query('DELETE FROM Obligaciones WHERE Id = @Id');
        res.json({ success: true, message: 'Obligación eliminada correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/entregas/cargar', async (req, res) => {
    const { entregaId, usuarioGestion } = req.body;
    const rolHeader = req.headers['x-user-rol'] || usuarioGestion || 'Operador';

    try {
        let pool = await sql.connect(dbConfig);
        
        let resultSelect = await pool.request()
            .input('Id', sql.Int, entregaId)
            .query('SELECT * FROM Obligaciones WHERE Id = @Id');

        if (resultSelect.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Obligación no encontrada.' });
        }

        const obligacion = resultSelect.recordset[0];
        let fechaActualVenc = new Date(obligacion.FechaVencimiento);
        let nuevoPeriodo = obligacion.PeriodoInformacion;
        const periodicidad = obligacion.Periodicidad ? obligacion.Periodicidad.toUpperCase() : '';

        await pool.request()
            .input('OficinaId', sql.Int, obligacion.OficinaId)
            .input('TituloInformacion', sql.VarChar, obligacion.TituloInformacion)
            .input('PortalPTE', sql.Bit, obligacion.PortalPTE)
            .input('PortalPTI', sql.Bit, obligacion.PortalPTI)
            .input('PeriodoInformacion', sql.VarChar, obligacion.PeriodoInformacion)
            .input('TipoDocumento', sql.VarChar, obligacion.TipoDocumento)
            .input('NumeroDocumento', sql.VarChar, obligacion.NumeroDocumento || null)
            .input('FechaSolicitud', sql.Date, obligacion.FechaSolicitud)
            .input('Periodicidad', sql.VarChar, obligacion.Periodicidad)
            .input('FechaVencimiento', sql.Date, obligacion.FechaVencimiento)
            .input('Url', sql.VarChar, obligacion.Url || null)
            .input('UsuarioGestion', sql.VarChar, rolHeader)
            .query(`
                INSERT INTO Obligaciones 
                (OficinaId, TituloInformacion, PortalPTE, PortalPTI, PeriodoInformacion, TipoDocumento, NumeroDocumento, FechaSolicitud, Periodicidad, FechaVencimiento, Url, Estado, FechaCarga, Semaforo, UsuarioGestion) 
                VALUES 
                (@OficinaId, @TituloInformacion, @PortalPTE, @PortalPTI, @PeriodoInformacion, @TipoDocumento, @NumeroDocumento, @FechaSolicitud, @Periodicidad, @FechaVencimiento, @Url, 'CUMPLIDO', GETDATE(), 'CUMPLIDO', @UsuarioGestion)
            `);

        if (periodicidad === 'SEMESTRAL') {
            let anioMatch = nuevoPeriodo.match(/\d{4}/);
            let anioActual = anioMatch ? parseInt(anioMatch[0]) : fechaActualVenc.getFullYear();
            let periodoLimpio = nuevoPeriodo.toUpperCase().trim();

            if (periodoLimpio.includes('-II')) {
                let nuevoAnio = anioActual + 1;
                nuevoPeriodo = `${nuevoAnio}-I`;
                fechaActualVenc = new Date(nuevoAnio, 5, 30);
            } else {
                nuevoPeriodo = `${anioActual}-II`;
                fechaActualVenc = new Date(anioActual, 11, 31);
            }
        } else if (periodicidad === 'ANUAL') {
            fechaActualVenc.setFullYear(fechaActualVenc.getFullYear() + 1);
            let anioMatch = nuevoPeriodo.match(/\d{4}/);
            if (anioMatch) {
                let nuevoAnio = parseInt(anioMatch[0]) + 1;
                nuevoPeriodo = nuevoPeriodo.replace(anioMatch[0], nuevoAnio);
            }
        } else if (periodicidad === 'MENSUAL') {
            fechaActualVenc.setMonth(fechaActualVenc.getMonth() + 1);
        }

        const nuevaFechaVencimientoStr = fechaActualVenc.toISOString().split('T')[0];
        const semaforoCalculado = calcularSemaforo(nuevaFechaVencimientoStr, 'PENDIENTE', periodicidad);

        await pool.request()
            .input('Id', sql.Int, entregaId)
            .input('FechaVencimiento', sql.Date, nuevaFechaVencimientoStr)
            .input('PeriodoInformacion', sql.VarChar, nuevoPeriodo)
            .input('Semaforo', sql.VarChar, semaforoCalculado)
            .input('UsuarioGestion', sql.VarChar, rolHeader)
            .query(`
                UPDATE Obligaciones 
                SET FechaVencimiento = @FechaVencimiento, PeriodoInformacion = @PeriodoInformacion, Estado = 'PENDIENTE', Semaforo = @Semaforo, UsuarioGestion = @UsuarioGestion
                WHERE Id = @Id
            `);

        res.json({ success: true, message: `¡Cumplimiento registrado y obligación reprogramada para ${nuevoPeriodo}!` });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});