require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const { sequelize, Equipo, Prestamo, Usuario } = require('./src/models');

async function testSuiteCompleta() {
  console.log('================================================================');
  console.log('🚀 SUITE COMPLETA DE PRUEBAS DE INTEGRACIÓN - REDTEC API REST');
  console.log('================================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(3003, resolve));
  const baseUrl = 'http://localhost:3003';
  let equipoPruebaId;
  let emailPrueba;

  async function request(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }

  let exitos = 0;
  let fallos = 0;

  function assert(condicion, descripcion, detalle = '') {
    if (condicion) {
      console.log(`✅ [PASS] ${descripcion}`);
      exitos++;
    } else {
      console.error(`❌ [FAIL] ${descripcion} - Detalle: ${detalle}`);
      fallos++;
    }
  }

  try {
    // 1. Health Check
    const health = await request('/api/health');
    assert(health.status === 200 && health.body.ok === true, 'Health check responde 200 OK');

    // 2. Logins
    const loginAdmin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@redtec.org', password: 'Admin123!' })
    });
    const tokenAdmin = loginAdmin.body.data?.token;

    const loginCarlos = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'carlos@redtec.org', password: 'Usuario123!' })
    });
    const tokenCarlos = loginCarlos.body.data?.token;

    const loginLucia = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'lucia@redtec.org', password: 'Usuario123!' })
    });
    const tokenLucia = loginLucia.body.data?.token;

    const loginMarcos = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'marcos@redtec.org', password: 'Usuario123!' })
    });
    const tokenMarcos = loginMarcos.body.data?.token;

    assert(tokenAdmin && tokenCarlos && tokenLucia && tokenMarcos, 'Autenticación exitosa para todos los roles de prueba');

    // 3. Criterio 7: Exclusión de password
    assert(
      !loginAdmin.body.data?.usuario?.password && !loginCarlos.body.data?.usuario?.password,
      'Criterio 7: El hash de password no se expone en ninguna respuesta'
    );

    // 4. Criterio 6: Registro forzado a usuario
    const reg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nombre: 'Nuevo Alumno',
        email: (emailPrueba = `alumno_${Date.now()}@redtec.org`),
        password: 'Password123!',
        rol: 'admin'
      })
    });
    assert(
      reg.status === 201 && reg.body.data?.usuario?.rol === 'usuario',
      'Criterio 6: Registro ignora rol "admin" del body y asigna estrictamente "usuario"'
    );

    // 5. Criterio 2: Sanción automática por mora → 403
    const fechaFutura = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const reqMora = await request('/api/prestamos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenLucia}` },
      body: JSON.stringify({ equipoId: 3, fechaDevolucionEsperada: fechaFutura })
    });
    assert(
      reqMora.status === 403,
      'Criterio 2: Usuario con préstamo vencido (Lucía) es sancionado con 403 Forbidden'
    );

    // 6. Criterio 1: Límite de 2 préstamos activos para usuario regular → 409
    const reqLimite = await request('/api/prestamos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMarcos}` },
      body: JSON.stringify({ equipoId: 3, fechaDevolucionEsperada: fechaFutura })
    });
    assert(
      reqLimite.status === 409,
      'Criterio 1: Usuario con 2 préstamos activos (Marcos) recibe 409 Conflict al pedir el 3.º'
    );

    // 7. Criterio 3: Equipos no disponibles (Mantenimiento o Prestado) → 409
    const reqMant = await request('/api/prestamos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ equipoId: 6, fechaDevolucionEsperada: fechaFutura }) // Equipo 6: Mantenimiento
    });
    assert(
      reqMant.status === 409,
      'Criterio 3A: Solicitud de equipo en mantenimiento responde 409 Conflict'
    );

    const reqPrestado = await request('/api/prestamos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCarlos}` },
      body: JSON.stringify({ equipoId: 4, fechaDevolucionEsperada: fechaFutura }) // Equipo 4: Prestado
    });
    assert(
      reqPrestado.status === 409,
      'Criterio 3B: Solicitud de equipo ya prestado responde 409 Conflict'
    );

    // 8. Criterio 4: RBAC estricto en eliminación de equipos → 403
    const reqDeleteRbac = await request('/api/equipos/1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenCarlos}` }
    });
    assert(
      reqDeleteRbac.status === 403,
      'Criterio 4: Usuario regular intentando DELETE de equipo recibe 403 Forbidden'
    );

    // 9. Criterio 5: Concurrencia y Bloqueo Pesimista
    // Usar un equipo temporal evita depender de cambios hechos manualmente en el catálogo.
    const equipoPrueba = await Equipo.create({
      nombre: `Equipo temporal de integración ${Date.now()}`,
      categoria: 'Pruebas',
      descripcion: 'Equipo temporal creado por la suite de integración.',
      estado: 'Disponible'
    });
    equipoPruebaId = equipoPrueba.id;
    const [p1, p2] = await Promise.all([
      request('/api/prestamos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenCarlos}` },
        body: JSON.stringify({ equipoId: equipoPruebaId, fechaDevolucionEsperada: fechaFutura })
      }),
      request('/api/prestamos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenCarlos}` },
        body: JSON.stringify({ equipoId: equipoPruebaId, fechaDevolucionEsperada: fechaFutura })
      })
    ]);
    const concurrenciaGanoUno = (p1.status === 201 && p2.status === 409) || (p2.status === 201 && p1.status === 409);
    assert(
      concurrenciaGanoUno,
      'Criterio 5: Dos solicitudes concurrentes por el mismo equipo: exactamente 1 ganó (201) y la otra recibió 409'
    );

    // 10. Devolución de préstamo y rechazo de devolución doble
    const prestamoExitosoId = p1.status === 201 ? p1.body.data?.id : p2.body.data?.id;
    const tokenTitular = p1.status === 201 ? tokenCarlos : tokenAdmin;
    const dev = await request(`/api/prestamos/${prestamoExitosoId}/devolver`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenTitular}` }
    });
    assert(
      dev.status === 200,
      'Devolución de préstamo por el titular se procesa exitosamente (200 OK)',
      `HTTP ${dev.status}: ${JSON.stringify(dev.body)}`
    );

    const devDoble = await request(`/api/prestamos/${prestamoExitosoId}/devolver`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenTitular}` }
    });
    assert(
      devDoble.status === 409,
      'Devolver un préstamo ya devuelto responde 409 Conflict',
      `HTTP ${devDoble.status}: ${JSON.stringify(devDoble.body)}`
    );

    console.log(`\n================================================================`);
    console.log(`🏁 RESULTADO: ${exitos} PRUEBAS PASARON, ${fallos} FALLARON`);
    console.log(`================================================================`);

    if (fallos > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Error en testSuiteCompleta:', err);
    process.exitCode = 1;
  } finally {
    try {
      if (equipoPruebaId) {
        await Prestamo.destroy({ where: { equipoId: equipoPruebaId } });
        await Equipo.destroy({ where: { id: equipoPruebaId } });
      }
      if (emailPrueba) {
        await Usuario.destroy({ where: { email: emailPrueba } });
      }
    } catch (cleanupError) {
      console.error('❌ Error limpiando datos temporales de prueba:', cleanupError);
      process.exitCode = 1;
    }

    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }).catch((closeError) => {
        console.error('❌ Error cerrando el servidor de pruebas:', closeError);
        process.exitCode = 1;
      });
    }
    await sequelize.close();
  }
}

testSuiteCompleta();
