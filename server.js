const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 6071 });
const clientes = new Map(); // ID -> { ws, tipo, nome, sala, conectadoEm }
const logsSistema = [];    // Histórico de acessos

// Credenciais do Admin
const ADMIN_USER = "admin";
const ADMIN_PASS = "McrMatriz2026";

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).substring(2, 9);
    clientes.set(id, { ws, tipo: null, nome: 'Autenticando...', sala: 'A', conectadoEm: null });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Autenticação do Admin
            if (data.action === 'login-admin') {
                if (data.user === ADMIN_USER && data.pass === ADMIN_PASS) {
                    const cliente = clientes.get(id);
                    cliente.tipo = 'admin';
                    cliente.nome = 'Mesa Central';
                    ws.send(JSON.stringify({ action: 'login-sucesso' }));
                    console.log(`[AUTH] Admin logado em 192.168.1.20:6071`);
                    
                    notificarPainelAdmin();
                    ws.send(JSON.stringify({ action: 'atualizar-logs', logs: logsSistema }));
                } else {
                    ws.send(JSON.stringify({ action: 'login-falha', erro: 'Usuário ou senha incorretos.' }));
                }
            }

            // 2. Registro do Usuário Externo
            if (data.action === 'registrar' && data.tipo === 'reporter') {
                const cliente = clientes.get(id);
                if (cliente) {
                    cliente.tipo = 'reporter';
                    cliente.nome = data.nome;
                    cliente.sala = data.sala || 'A';
                    cliente.conectadoEm = new Date().toLocaleTimeString('pt-BR');
                    
                    console.log(`[MCR] Operador conectado: ${data.nome}`);
                    
                    logsSistema.push({
                        idUsuario: id,
                        nome: data.nome,
                        entrada: cliente.conectadoEm,
                        saida: '— (Ativo)'
                    });

                    notificarPainelAdmin();
                    enviarLogsParaAdmin();
                }
            }

            // 3. Matriz de Comutação de Salas
            if (data.action === 'trocar-sala') {
                const alvo = clientes.get(data.target);
                if (alvo) {
                    alvo.sala = data.novaSala;
                    alvo.ws.send(JSON.stringify({ action: 'mudar-sala-remoto', novaSala: data.novaSala }));
                    notificarPainelAdmin();
                }
            }

            // 4. Comandos de Áudio (Talk/Mute)
            if (data.action === 'comando-audio') {
                const alvo = clientes.get(data.target);
                if (alvo && alvo.ws.readyState === ws.OPEN) {
                    alvo.ws.send(JSON.stringify({ action: data.comando }));
                }
            }

            // 5. Comando Administrativo: EXPULSAR USUÁRIO (KICK)
            if (data.action === 'kick-user') {
                const alvo = clientes.get(data.target);
                if (alvo) {
                    console.log(`[ADMIN] Expulsando usuário: ${alvo.nome}`);
                    alvo.ws.send(JSON.stringify({ action: 'forcar-desconexao', motivo: 'Expulso pelo Administrador' }));
                    alvo.ws.close();
                }
            }

            // Repasse WebRTC (SDP e ICE)
            if (data.target && data.action !== 'login-admin' && data.action !== 'kick-user') {
                let destinoId = data.target;
                if (data.target === 'admin') {
                    for (let [cId, c] of clientes.entries()) {
                        if (c.tipo === 'admin') { destinoId = cId; break; }
                    }
                }
                const destino = clientes.get(destinoId);
                if (destino && destino.ws.readyState === ws.OPEN) {
                    data.sender = id;
                    destino.ws.send(JSON.stringify(data));
                }
            }
        } catch (e) {
            console.error(e);
        }
    });

    ws.on('close', () => {
        const cliente = clientes.get(id);
        if (cliente && cliente.tipo === 'reporter') {
            const horarioSaida = new Date().toLocaleTimeString('pt-BR');
            const logIndex = logsSistema.findLastIndex(l => l.idUsuario === id);
            if (logIndex !== -1) {
                logsSistema[logIndex].saida = horarioSaida;
            }
            console.log(`[MCR] Operador desconectado: ${cliente.nome}`);
            enviarLogsParaAdmin();
        }
        clientes.delete(id);
        notificarPainelAdmin();
    });
});

function notificarPainelAdmin() {
    const listaReporteres = [];
    let adminWs = null;
    for (let [id, c] of clientes.entries()) {
        if (c.tipo === 'admin') adminWs = c.ws;
        else if (c.tipo === 'reporter') listaReporteres.push({ id, nome: c.nome, sala: c.sala, conectadoEm: c.conectadoEm });
    }
    if (adminWs && adminWs.readyState === adminWs.OPEN) {
        adminWs.send(JSON.stringify({ action: 'lista-reporteres', lista: listaReporteres }));
    }
}

function enviarLogsParaAdmin() {
    for (let [id, c] of clientes.entries()) {
        if (c.tipo === 'admin' && c.ws.readyState === c.ws.OPEN) {
            c.ws.send(JSON.stringify({ action: 'atualizar-logs', logs: logsSistema }));
        }
    }
}

console.log("Servidor Matrix Intercom ativo na porta 6071 [Com Controle de Acesso]");
