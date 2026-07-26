// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://smyyaugghkiofqiibpjo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1wTBxq7IVU5QzxxsWqla6A_uIfyvhTA';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let globalAthletes = [];
let globalAttendance = [];

// Função para carregar todos os dados da nuvem ao iniciar o app
async function loadDataFromSupabase() {
    try {
        const { data: athletes, error: errAthletes } = await _supabase.from('atletas').select('*');
        if (errAthletes) console.error('Erro ao buscar atletas:', errAthletes.message);
        else globalAthletes = athletes || [];

        const { data: attendance, error: errAttendance } = await _supabase.from('chamadas').select('*');
        if (errAttendance) console.error('Erro ao buscar chamadas:', errAttendance.message);
        else globalAttendance = attendance || [];
    } catch (err) {
        console.error('Erro de conexão com o Supabase:', err);
    }
}

// Substitui o antigo saveData para enviar direto para o Supabase
async function saveData(type, dataObj) {
    if (type === 'athlete') {
        const { error } = await _supabase.from('atletas').upsert([dataObj]);
        if (error) alert('Erro ao salvar atleta na nuvem: ' + error.message);
    } else if (type === 'attendance') {
        const { error } = await _supabase.from('chamadas').upsert([dataObj]);
        if (error) alert('Erro ao salvar chamada na nuvem: ' + error.message);
    }
}

// Funções para excluir da nuvem
async function deleteAthleteFromCloud(id) {
    const { error } = await _supabase.from('atletas').delete().eq('id', id);
    if (error) alert('Erro ao excluir atleta: ' + error.message);
}

async function deleteAttendanceFromCloud(id) {
    const { error } = await _supabase.from('chamadas').delete().eq('id', id);
    if (error) alert('Erro ao excluir chamada: ' + error.message);
}

// --- CONTROLE DE NAVEGAÇÃO ---

async function openApp() {
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').classList.add('active');
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('chamadaData').value = today;
    
    // Baixa os dados do Supabase antes de renderizar a tela
    await loadDataFromSupabase();
    
    renderAthletesTable();
}

function logout() {
    document.getElementById('app').classList.remove('active');
    document.getElementById('login').style.display = 'flex';
}

function showTab(index) {
    const buttons = document.querySelectorAll('#app nav button');
    const sections = document.querySelectorAll('#app main section');
    
    buttons.forEach((btn, i) => btn.classList.toggle('active', i === index));
    sections.forEach((sec, i) => sec.classList.toggle('hidden', i !== index));

    if (index === 0) renderAthletesTable();
    if (index === 1) {
        // Se não estiver editando, limpa/reseta para o padrão de nova chamada
        if (!document.getElementById('attendanceId').value) {
            loadAttendanceList();
        }
    }
    if (index === 2) renderAttendanceHistory();
    if (index === 3) renderAttendanceReport();
}

function openNewAthleteForm() {
    document.getElementById('athleteId').value = '';
    document.getElementById('athleteDataCadastro').value = '';
    document.getElementById('athleteForm').reset();
    document.getElementById('formAthleteTitle').textContent = 'Cadastrar Novo Atleta';
    document.getElementById('btnSaveAthlete').textContent = 'Salvar Atleta';
    currentPhotoBase64 = "";
    document.getElementById('photoPreviewContainer').classList.add('hidden');
    document.getElementById('form').classList.remove('hidden');
}

function toggleForm() {
    const formContainer = document.getElementById('form');
    formContainer.classList.toggle('hidden');
    if (formContainer.classList.contains('hidden')) {
        document.getElementById('athleteId').value = '';
        document.getElementById('athleteDataCadastro').value = '';
        document.getElementById('athleteForm').reset();
        currentPhotoBase64 = "";
        document.getElementById('photoPreviewContainer').classList.add('hidden');
    }
}

function toggleReportOptions() {
    const card = document.getElementById('reportOptionsCard');
    card.classList.toggle('hidden');
}

let currentPhotoBase64 = "";
function previewPhoto(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentPhotoBase64 = e.target.result;
            document.getElementById('photoPreview').src = currentPhotoBase64;
            document.getElementById('photoPreviewContainer').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
}

function openPhotoNewTab(base64Image) {
    if (!base64Image) return;
    const imageWindow = window.open("");
    imageWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Foto do Atleta</title>
            <style>
                body { margin: 0; background-color: #111; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                img { max-width: 90vw; max-height: 90vh; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.8); }
            </style>
        </head>
        <body>
            <img src="${base64Image}" alt="Foto do Atleta">
        </body>
        </html>
    `);
}

// --- CADASTRO E EDIÇÃO DE ATLETAS ---

function saveAthlete(event) {
    event.preventDefault();
    
    const id = document.getElementById('athleteId').value;
    const existingDataCadastro = document.getElementById('athleteDataCadastro').value;
    const nome = document.getElementById('nome').value.trim();
    const apelido = document.getElementById('apelido').value.trim();
    const dataNasc = document.getElementById('dataNasc').value;
    const turma = document.getElementById('turma').value;
    
    const indicacao = document.getElementById('indicacao').value.trim();
    const telefoneAtleta = document.getElementById('telefoneAtleta').value.trim();
    const responsavel = document.getElementById('responsavel').value.trim();
    const telefone = document.getElementById('telefone').value.trim();

    if (!nome || !apelido || !dataNasc || !turma) {
        alert('Por favor, preencha todos os campos obrigatórios (*): Nome, Apelido, Data de Nascimento e Turma.');
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const athleteData = {
        id: id || Date.now().toString(),
        dataCadastro: existingDataCadastro || todayStr,
        nome,
        apelido,
        dataNasc,
        turma,
        indicacao: indicacao || '-',
        telefoneAtleta: telefoneAtleta || '-',
        responsavel: responsavel || '-',
        telefone: telefone || '-',
        foto: currentPhotoBase64
    };

    if (id) {
        const index = globalAthletes.findIndex(a => a.id === id);
        if (index !== -1) globalAthletes[index] = athleteData;
    } else {
        globalAthletes.push(athleteData);
    }

    saveData();
    alert('Atleta salvo com sucesso!');

    document.getElementById('athleteForm').reset();
    document.getElementById('athleteId').value = '';
    document.getElementById('athleteDataCadastro').value = '';
    currentPhotoBase64 = "";
    document.getElementById('photoPreviewContainer').classList.add('hidden');
    document.getElementById('form').classList.add('hidden');
    renderAthletesTable();
}

function editAthlete(id) {
    const athlete = globalAthletes.find(a => a.id === id);
    if (!athlete) return;

    document.getElementById('athleteId').value = athlete.id;
    document.getElementById('athleteDataCadastro').value = athlete.dataCadastro || '';
    document.getElementById('nome').value = athlete.nome;
    document.getElementById('apelido').value = athlete.apelido;
    document.getElementById('dataNasc').value = athlete.dataNasc;
    document.getElementById('turma').value = athlete.turma;
    
    document.getElementById('indicacao').value = athlete.indicacao === '-' ? '' : (athlete.indicacao || '');
    document.getElementById('telefoneAtleta').value = athlete.telefoneAtleta === '-' ? '' : (athlete.telefoneAtleta || '');
    document.getElementById('responsavel').value = athlete.responsavel === '-' ? '' : (athlete.responsavel || '');
    document.getElementById('telefone').value = athlete.telefone === '-' ? '' : (athlete.telefone || '');

    if (athlete.foto) {
        currentPhotoBase64 = athlete.foto;
        document.getElementById('photoPreview').src = athlete.foto;
        document.getElementById('photoPreviewContainer').classList.remove('hidden');
    } else {
        currentPhotoBase64 = "";
        document.getElementById('photoPreviewContainer').classList.add('hidden');
    }

    document.getElementById('formAthleteTitle').textContent = 'Editar Atleta';
    document.getElementById('btnSaveAthlete').textContent = 'Atualizar Atleta';
    document.getElementById('form').classList.remove('hidden');
    document.getElementById('form').scrollIntoView({ behavior: 'smooth' });
}

function deleteAthlete(id) {
    if (confirm('Tem certeza que deseja excluir este atleta?')) {
        globalAthletes = globalAthletes.filter(a => a.id !== id);
        saveData();
        renderAthletesTable();
    }
}

// --- FILTROS E RENDERIZAÇÃO DE ATLETAS ---

function updateYearCheckboxes() {
    const container = document.getElementById('filterYearCheckboxes');
    if (!container) return;

    const years = [...new Set(globalAthletes.map(a => a.dataNasc ? a.dataNasc.split('-')[0] : null).filter(Boolean))].sort();

    if (years.length === 0) {
        container.innerHTML = '<span style="color:#aaa; font-size:0.8rem;">Sem dados</span>';
        return;
    }

    const currentChecked = Array.from(document.querySelectorAll('.filter-year-cb:checked')).map(cb => cb.value);

    container.innerHTML = years.map(year => {
        const isChecked = currentChecked.includes(year) ? 'checked' : '';
        return `
            <label>
                <input type="checkbox" value="${year}" class="filter-year-cb" ${isChecked} onchange="applyFilters()">
                ${year}
            </label>
        `;
    }).join('');
}

function applyFilters() {
    const selectedTurma = document.getElementById('filterTurma').value;
    const checkedYearCBs = Array.from(document.querySelectorAll('.filter-year-cb:checked')).map(cb => cb.value);

    let filtered = [...globalAthletes];

    if (selectedTurma !== 'TODAS') {
        filtered = filtered.filter(a => a.turma === selectedTurma);
    }

    if (checkedYearCBs.length > 0) {
        filtered = filtered.filter(a => {
            const athleteYear = a.dataNasc ? a.dataNasc.split('-')[0] : '';
            return checkedYearCBs.includes(athleteYear);
        });
    }

    renderFilteredAthletes(filtered);
}

function renderAthletesTable() {
    updateYearCheckboxes();
    applyFilters();
}

function renderFilteredAthletes(athletesList) {
    const tbody = document.getElementById('athletesTableBody');
    document.getElementById('totalAtletas').textContent = athletesList.length;

    if (athletesList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-msg">Nenhum atleta encontrado com os filtros selecionados.</td></tr>`;
        let containerCardsDiv = document.getElementById('dynamicTurmasCardsContainer');
        if (containerCardsDiv) containerCardsDiv.innerHTML = '';
        return;
    }

    const turmasDefinidas = [
        "Segunda e Quarta - 18:30 às 19:30",
        "Segunda e Quarta - 19:40 às 20:40",
        "Terça e Quinta - 18:30 às 19:30"
    ];

    let cardsHtml = '';

    const buildTableRows = (atletasTurma) => {
        atletasTurma.sort((a, b) => a.nome.localeCompare(b.nome));
        return atletasTurma.map(athlete => {
            const photoHtml = athlete.foto 
                ? `<img src="${athlete.foto}" class="athlete-avatar" alt="${athlete.nome}" title="Clique para ver a foto" onclick="openPhotoNewTab('${athlete.foto}')">`
                : `<div class="athlete-avatar" style="display:flex; align-items:center; justify-content:center; background:#333; font-weight:bold;">${athlete.nome.charAt(0).toUpperCase()}</div>`;

            const dataFormatada = athlete.dataNasc ? athlete.dataNasc.split('-').reverse().join('/') : '-';

            return `
                <tr>
                    <td>${photoHtml}</td>
                    <td>
                        <strong>${athlete.nome}</strong>
                        ${athlete.apelido ? '<br><small style="color:#aaa">Apelido: ' + athlete.apelido + '</small>' : ''}
                    </td>
                    <td>${dataFormatada}</td>
                    <td><span style="background:#2a2a2a; padding:4px 8px; border-radius:4px; font-size:0.85rem;">${athlete.turma}</span></td>
                    <td><small style="color:#ddd;">${athlete.indicacao || '-'}</small></td>
                    <td>
                        ${athlete.responsavel !== '-' ? athlete.responsavel : '<span style="color:#777;">Não inf.</span>'}<br>
                        <small style="color:#84cc16; font-weight:bold;">Resp: ${athlete.telefone !== '-' ? athlete.telefone : 'Não inf.'}</small>
                    </td>
                    <td>
                        <button class="btn-action btn-view" onclick="viewAthlete('${athlete.id}')">Ver</button>
                        <button class="btn-action btn-edit" onclick="editAthlete('${athlete.id}')">Editar</button>
                        <button class="btn-action btn-delete" onclick="deleteAthlete('${athlete.id}')">Excluir</button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    turmasDefinidas.forEach(nomeTurma => {
        const atletasDaTurma = athletesList.filter(a => a.turma === nomeTurma);
        if (atletasDaTurma.length > 0) {
            cardsHtml += `
                <div style="background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5);">
                    <div style="background: #181818; padding: 12px 16px; border-bottom: 1px solid #2a2a2a; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: #84cc16; font-size: 1rem;">⚽ Turma: ${nomeTurma}</h3>
                        <span style="background: #2a2a2a; color: #f8fafc; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${atletasDaTurma.length} atleta(s)</span>
                    </div>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left;">
                            <thead>
                                <tr style="border-bottom: 1px solid #2a2a2a; color: #aaa; font-size: 0.8rem;">
                                    <th style="padding: 10px;">Foto</th>
                                    <th style="padding: 10px;">Nome / Apelido</th>
                                    <th style="padding: 10px;">Data Nasc.</th>
                                    <th style="padding: 10px;">Turma</th>
                                    <th style="padding: 10px;">Indicação</th>
                                    <th style="padding: 10px;">Responsável / Tel</th>
                                    <th style="padding: 10px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${buildTableRows(atletasDaTurma)}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
    });

    const outrasTurmasAtletas = athletesList.filter(a => !turmasDefinidas.includes(a.turma));
    if (outrasTurmasAtletas.length > 0) {
        cardsHtml += `
            <div style="background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5);">
                <div style="background: #181818; padding: 12px 16px; border-bottom: 1px solid #2a2a2a; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #84cc16; font-size: 1rem;">⚽ Outras Turmas</h3>
                    <span style="background: #2a2a2a; color: #f8fafc; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${outrasTurmasAtletas.length} atleta(s)</span>
                </div>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="border-bottom: 1px solid #2a2a2a; color: #aaa; font-size: 0.8rem;">
                                <th style="padding: 10px;">Foto</th>
                                <th style="padding: 10px;">Nome / Apelido</th>
                                <th style="padding: 10px;">Data Nasc.</th>
                                <th style="padding: 10px;">Turma</th>
                                <th style="padding: 10px;">Indicação</th>
                                <th style="padding: 10px;">Responsável / Tel</th>
                                <th style="padding: 10px;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${buildTableRows(outrasTurmasAtletas)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    const tableWrapper = tbody.closest('.table-container') || tbody.parentNode.parentNode;
    let containerCardsDiv = document.getElementById('dynamicTurmasCardsContainer');
    if (!containerCardsDiv) {
        containerCardsDiv = document.createElement('div');
        containerCardsDiv.id = 'dynamicTurmasCardsContainer';
        tableWrapper.parentNode.insertBefore(containerCardsDiv, tableWrapper);
    }
    
    containerCardsDiv.innerHTML = cardsHtml;
    tableWrapper.style.display = 'none';
}

function viewAthlete(id) {
    const athlete = globalAthletes.find(a => a.id === id);
    if (!athlete) return;

    const todasAulasTurma = globalAttendance.filter(h => h.turma === athlete.turma);
    const totalAulasGeral = todasAulasTurma.length;

    const aulasPosCadastro = todasAulasTurma.filter(h => !athlete.dataCadastro || h.data >= athlete.dataCadastro);
    const totalAulasPos = aulasPosCadastro.length;

    const presencas = todasAulasTurma.filter(h => h.presentes && h.presentes.includes(athlete.nome)).length;
    
    const faltasPos = totalAulasPos - presencas;
    const taxaPos = totalAulasPos > 0 ? Math.round((presencas / totalAulasPos) * 100) : 0;
    const taxaGeral = totalAulasGeral > 0 ? Math.round((presencas / totalAulasGeral) * 100) : 0;

    const modalDetails = document.getElementById('modalDetails');
    const photoHtml = athlete.foto 
        ? `<img src="${athlete.foto}" style="max-width:120px; max-height:120px; border-radius:8px; margin-bottom:15px; border:2px solid #84cc16; cursor:pointer;" title="Clique para abrir em nova aba" onclick="openPhotoNewTab('${athlete.foto}')">`
        : `<div class="athlete-avatar" style="width:70px; height:70px; font-size:1.8rem; margin:0 auto 15px; display:flex; align-items:center; justify-content:center; background:#333;">${athlete.nome.charAt(0)}</div>`;

    const dataFormatada = athlete.dataNasc ? athlete.dataNasc.split('-').reverse().join('/') : '-';
    const dataCadFormatada = athlete.dataCadastro ? athlete.dataCadastro.split('-').reverse().join('/') : '-';

    const foneAtletaClean = athlete.telefoneAtleta && athlete.telefoneAtleta !== '-' ? athlete.telefoneAtleta.replace(/\D/g, '') : '';
    const foneAtletaHtml = foneAtletaClean 
        ? `<a href="https://wa.me/55${foneAtletaClean}" target="_blank" style="color:#84cc16; text-decoration:none; font-weight:bold;">📱 ${athlete.telefoneAtleta}</a>` 
        : 'Não informado';

    const foneRespClean = athlete.telefone && athlete.telefone !== '-' ? athlete.telefone.replace(/\D/g, '') : '';
    const foneRespHtml = foneRespClean 
        ? `<a href="https://wa.me/55${foneRespClean}" target="_blank" style="color:#84cc16; text-decoration:none; font-weight:bold;">📱 ${athlete.telefone}</a>` 
        : (athlete.telefone !== '-' ? athlete.telefone : 'Não informado');

    modalDetails.innerHTML = `
        <div style="text-align: center;">
            ${photoHtml}
            <h2 style="color:#fff; margin-bottom:5px;">${athlete.nome}</h2>
            <p style="color:#aaa; margin-bottom:15px;">"${athlete.apelido}"</p>
        </div>
        <hr style="border:0; border-top:1px solid #333; margin:15px 0;">
        <p style="margin-bottom:8px;"><strong>Turma:</strong> ${athlete.turma}</p>
        <p style="margin-bottom:8px;"><strong>Data de Nascimento:</strong> ${dataFormatada}</p>
        <p style="margin-bottom:8px;"><strong>Data de Cadastro:</strong> ${dataCadFormatada}</p>
        <p style="margin-bottom:8px;"><strong>Indicação:</strong> ${athlete.indicacao || '-'}</p>
        <p style="margin-bottom:8px;"><strong>WhatsApp do Atleta:</strong> ${foneAtletaHtml}</p>
        <hr style="border:0; border-top:1px dashed #333; margin:10px 0;">
        <p style="margin-bottom:8px;"><strong>Responsável:</strong> ${athlete.responsavel !== '-' ? athlete.responsavel : 'Não informado'}</p>
        <p style="margin-bottom:8px;"><strong>WhatsApp do Responsável:</strong> ${foneRespHtml}</p>
        <hr style="border:0; border-top:1px solid #333; margin:15px 0;">
        <h4 style="margin-bottom:8px; color:#84cc16;">Resumo de Frequência</h4>
        <p style="margin-bottom:4px;"><strong>Aulas Totais da Turma:</strong> ${totalAulasGeral}</p>
        <p style="margin-bottom:4px;"><strong>Aulas após Cadastro:</strong> ${totalAulasPos}</p>
        <p style="margin-bottom:4px; color:#84cc16;"><strong>Presenças:</strong> ${presencas}</p>
        <p style="margin-bottom:4px; color:#ef4444;"><strong>Faltas (pós-cadastro):</strong> ${faltasPos}</p>
        <p style="margin-bottom:4px;"><strong>Assiduidade (Pós-Cadastro):</strong> ${taxaPos}%</p>
        <p style="margin-bottom:8px;"><strong>Assiduidade (Geral):</strong> ${taxaGeral}%</p>
    `;

    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

// --- SCRIPT EMBUTIDO DE CONVERSÃO EM PDF VIA HTML2PDF ---

function getPDFScriptTag() {
    return `
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        <script>
            async function sharePagePDF(filename, orientation) {
                const btnBox = document.getElementById('no-print-area');
                if (btnBox) btnBox.style.display = 'none';

                const element = document.getElementById('pdf-content-area') || document.body;

                const opt = {
                    margin: [8, 8, 8, 8],
                    filename: filename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: orientation }
                };

                try {
                    html2pdf().set(opt).from(element).save().then(() => {
                        if (btnBox) btnBox.style.display = 'flex';
                    });

                } catch (err) {
                    console.error('Erro ao gerar PDF:', err);
                    if (btnBox) btnBox.style.display = 'flex';
                    alert('Não foi possível gerar o PDF. Tente usar o botão de Imprimir/Salvar.');
                }
            }
        </script>
    `;
}

function generatePrintHeader() {
    return `
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #84cc16; padding-bottom:8px; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="Logo academy.jpg" alt="Logo Prosol Academy" style="max-height:45px; width:auto;" onerror="this.style.display='none'"/>
                <div>
                    <h1 style="margin:0; font-size:1.2rem; color:#4d7c0f; font-family:sans-serif;">PROSOL ACADEMY</h1>
                    <p style="margin:1px 0 0; color:#555; font-size:0.75rem; font-family:sans-serif;">Sistema de Gestão Esportiva</p>
                </div>
            </div>
            <div style="text-align:right; font-size:0.7rem; color:#666; font-family:sans-serif;">
                Emissão: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
            </div>
        </div>
    `;
}

// --- GERADOR DO HTML DO RELATÓRIO DE ATLETAS (NA ABA GERADA) ---

function buildAthletesReportHTML() {
    const incApelido = document.getElementById('rep_apelido').checked;
    const incDataNasc = document.getElementById('rep_dataNasc').checked;
    const incTurma = document.getElementById('rep_turma').checked;
    const incTelAtleta = document.getElementById('rep_telAtleta').checked;
    const incResponsavel = document.getElementById('rep_responsavel').checked;
    const incTelefone = document.getElementById('rep_telefone').checked;
    const incIndicacao = document.getElementById('rep_indicacao').checked;

    let list = [...globalAthletes];
    if (list.length === 0) return null;

    const optionalFieldsCount = [incApelido, incDataNasc, incTurma, incTelAtleta, incResponsavel, incTelefone, incIndicacao].filter(Boolean).length;
    const isPortrait = optionalFieldsCount <= 4;
    const pageOrientation = isPortrait ? 'portrait' : 'landscape';

    const turmasDefinidas = [
        "Segunda e Quarta - 18:30 às 19:30",
        "Segunda e Quarta - 19:40 às 20:40",
        "Terça e Quinta - 18:30 às 19:30"
    ];

    let cardsHtml = '';

    const renderTableForGroup = (atletasList, tituloGroup) => {
        let tableHeaders = `<th>Nome Completo</th>`;
        if (incApelido) tableHeaders += `<th>Apelido</th>`;
        if (incDataNasc) tableHeaders += `<th>Data Nasc.</th>`;
        if (incTurma) tableHeaders += `<th>Turma</th>`;
        if (incTelAtleta) tableHeaders += `<th>Tel. Atleta</th>`;
        if (incIndicacao) tableHeaders += `<th>Indicação</th>`;
        if (incResponsavel) tableHeaders += `<th>Responsável</th>`;
        if (incTelefone) tableHeaders += `<th>Tel. Responsável</th>`;

        let tableRows = '';
        atletasList.forEach(a => {
            const dtFmt = a.dataNasc ? a.dataNasc.split('-').reverse().join('/') : '-';
            tableRows += `<tr>`;
            tableRows += `<td><strong>${a.nome}</strong></td>`;
            if (incApelido) tableRows += `<td>${a.apelido || '-'}</td>`;
            if (incDataNasc) tableRows += `<td>${dtFmt}</td>`;
            if (incTurma) tableRows += `<td>${a.turma}</td>`;
            if (incTelAtleta) tableRows += `<td>${a.telefoneAtleta || '-'}</td>`;
            if (incIndicacao) tableRows += `<td>${a.indicacao || '-'}</td>`;
            if (incResponsavel) tableRows += `<td>${a.responsavel || '-'}</td>`;
            if (incTelefone) tableRows += `<td>${a.telefone || '-'}</td>`;
            tableRows += `</tr>`;
        });

        return `
            <div class="turma-card">
                <div class="turma-header">
                    ⚽ Turma: ${tituloGroup} (${atletasList.length} atletas)
                </div>
                <div style="padding: 4px 6px;">
                    <table class="${isPortrait ? 'single-line-table' : ''}">
                        <thead>
                            <tr>${tableHeaders}</tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    };

    turmasDefinidas.forEach(nomeTurma => {
        const atletasDaTurma = list
            .filter(a => a.turma === nomeTurma)
            .sort((a, b) => a.nome.localeCompare(b.nome));

        if (atletasDaTurma.length > 0) {
            cardsHtml += renderTableForGroup(atletasDaTurma, nomeTurma);
        }
    });

    const outrosAtletas = list.filter(a => !turmasDefinidas.includes(a.turma));
    if (outrosAtletas.length > 0) {
        cardsHtml += renderTableForGroup(outrosAtletas, "Outras Turmas");
    }

    const styleRules = `
        @page {
            size: A4 ${pageOrientation};
            margin: 8mm;
        }
        body { 
            font-family: Arial, sans-serif; 
            color: #111; 
            padding: 10px; 
            line-height: 1.15;
            font-size: ${isPortrait ? '0.72rem' : '0.75rem'}; 
            background: #fff;
        }
        #no-print-area {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            background: #f1f5f9;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid #cbd5e1;
        }
        .btn-print {
            background-color: #84cc16;
            color: #000;
            font-weight: bold;
            border: none;
            padding: 10px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85rem;
        }
        .btn-share-pdf {
            background-color: #25d366;
            color: #fff;
            font-weight: bold;
            border: none;
            padding: 10px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85rem;
        }
        .turma-card {
            border: 1px solid #ccc;
            border-top: 3px solid #84cc16;
            border-radius: 4px;
            margin-bottom: 12px;
            overflow: hidden;
            background: #fff;
            page-break-inside: avoid;
        }
        .turma-header {
            background-color: #f8fafb;
            color: #2e5300;
            padding: 5px 10px;
            font-weight: bold;
            font-size: 0.82rem;
            border-bottom: 1px solid #e5e7eb;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            table-layout: fixed; /* AQUI FOI ALTERADO DE 'auto' PARA 'fixed' */
        }
        th, td { 
            border: 1px solid #e5e7eb; 
            padding: ${isPortrait ? '3px 5px' : '4px 6px'}; 
            font-size: ${isPortrait ? '0.7rem' : '0.75rem'}; 
            text-align: left; 
        }
        th { 
            background-color: #f4f9eb;
            color: #2e5300; 
            font-weight: bold; 
        }
        tr:nth-child(even) { 
            background-color: #fafafa; 
        }
        .single-line-table td, .single-line-table th {
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 180px;
        }
        .total-box { 
            margin-top: 10px; 
            font-size: 0.9rem; 
            font-weight: bold; 
            text-align: right; 
            color: #4d7c0f; 
            border-top: 2px solid #84cc16; 
            padding-top: 6px; 
        }
        @media print {
            #no-print-area { display: none !important; }
            body { padding: 0; }
        }
    `;

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Relatório de Atletas - Prosol Academy</title>
            <style>${styleRules}</style>
            ${getPDFScriptTag()}
        </head>
        <body>
            <div id="no-print-area">
                <button class="btn-share-pdf" onclick="sharePagePDF('Relatorio_Atletas_Prosol.pdf', '${pageOrientation}')">📥 BAIXAR ESTE RELATÓRIO EM PDF</button>
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF Nativo</button>
            </div>

            <div id="pdf-content-area">
                ${generatePrintHeader()}
                <h2 style="color:#333; margin-top:0; margin-bottom:8px; font-size:0.95rem;">
                    📋 Relatório Geral de Atletas Cadastrados
                </h2>
                ${cardsHtml}
                <div class="total-box">
                    Total: ${list.length} atletas
                </div>
            </div>
        </body>
        </html>
    `;
}

function openAthletesReportTab() {
    const htmlContent = buildAthletesReportHTML();
    if (!htmlContent) {
        alert('Nenhum atleta cadastrado para gerar relatório.');
        return;
    }

    const printWin = window.open('', '_blank');
    printWin.document.write(htmlContent);
    printWin.document.close();
    printWin.focus();
}

// --- CHAMADAS ---

function loadAttendanceList(selectedPresentes = null) {
    const selectedTurma = document.getElementById('chamadaTurma').value;
    const dataChamada = document.getElementById('chamadaData').value;
    const checklist = document.getElementById('attendanceChecklist');
    checklist.innerHTML = '';

    if (!selectedTurma) {
        checklist.innerHTML = '<p class="empty-msg">Selecione uma turma acima para carregar a lista de atletas.</p>';
        return;
    }

    const athletes = globalAthletes.filter(a => {
        const pertenceTurma = a.turma === selectedTurma;
        const cadastradoAteData = !a.dataCadastro || !dataChamada || a.dataCadastro <= dataChamada;
        return pertenceTurma && cadastradoAteData;
    });

    if (athletes.length === 0) {
        checklist.innerHTML = '<p class="empty-msg">Nenhum atleta cadastrado nesta turma até a data selecionada.</p>';
        return;
    }

    athletes.sort((a, b) => a.nome.localeCompare(b.nome));

    // Se selectedPresentes for um array, significa que estamos editando. 
    // Caso contrário (null), é uma nova chamada e todos começam marcados por padrão.
    const isEditing = Array.isArray(selectedPresentes);
    const presentesSalvos = isEditing ? selectedPresentes.map(nome => nome.trim()) : [];

    athletes.forEach(athlete => {
        const item = document.createElement('div');
        item.className = 'checklist-item';
        
        let isChecked = false;
        if (isEditing) {
            isChecked = presentesSalvos.includes(athlete.nome.trim());
        } else {
            isChecked = false; // Nova chamada: todos marcados por padrão
        }

        const checkedAttr = isChecked ? 'checked' : '';
        const dataNascFormat = athlete.dataNasc ? athlete.dataNasc.split('-').reverse().join('/') : '-';
        
        item.innerHTML = `
            <label style="display:flex; align-items:center; width:100%; cursor:pointer;">
                <input type="checkbox" value="${athlete.nome}" class="athlete-checkbox" ${checkedAttr}>
                <span style="margin-left:10px;">
                    <strong>${athlete.nome}</strong> (${athlete.apelido || ''}) - ${dataNascFormat}
                </span>
            </label>
        `;
        checklist.appendChild(item);
    });
}

function saveAttendance(event) {
    event.preventDefault();
    
    const id = document.getElementById('attendanceId').value;
    const data = document.getElementById('chamadaData').value;
    const turma = document.getElementById('chamadaTurma').value;
    const obs = document.getElementById('chamadaObs').value.trim();

    if (!data || !turma) {
        alert('Selecione a data e a turma.');
        return;
    }

    const checkboxes = document.querySelectorAll('.athlete-checkbox:checked');
    const presentes = Array.from(checkboxes).map(cb => cb.value);

    const recordData = {
        id: id || Date.now().toString(),
        data,
        turma,
        obs: obs || '-',
        presentes
    };

    if (id) {
        const index = globalAttendance.findIndex(r => r.id === id);
        if (index !== -1) globalAttendance[index] = recordData;
    } else {
        globalAttendance.push(recordData);
    }

    saveData();
    alert(`Chamada salva com sucesso! ${presentes.length} presente(s).`);

    cancelAttendanceEdit();
    showTab(2);
}

function editAttendance(id) {
    const record = globalAttendance.find(r => r.id === id);
    if (!record) return;

    document.getElementById('attendanceId').value = record.id;
    document.getElementById('chamadaData').value = record.data;
    document.getElementById('chamadaTurma').value = record.turma;
    document.getElementById('chamadaObs').value = record.obs === '-' ? '' : (record.obs || '');
    
    document.getElementById('attendanceFormTitle').textContent = 'Editar Chamada Salva';
    document.getElementById('btnSaveAttendance').textContent = 'Atualizar Chamada';
    document.getElementById('btnCancelAttendanceEdit').classList.remove('hidden');

    // Carrega a lista passando explicitamente os presentes salvos para manter o estado correto
    loadAttendanceList(record.presentes || []);
    showTab(1);
}

function cancelAttendanceEdit() {
    document.getElementById('attendanceId').value = '';
    document.getElementById('attendanceForm').reset();
    document.getElementById('chamadaObs').value = '';
    document.getElementById('attendanceFormTitle').textContent = 'Registrar Nova Chamada';
    document.getElementById('btnSaveAttendance').textContent = 'Salvar Chamada';
    document.getElementById('btnCancelAttendanceEdit').classList.add('hidden');
    document.getElementById('attendanceChecklist').innerHTML = '<p class="empty-msg">Selecione a data e a turma acima para carregar a lista de atletas.</p>';
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('chamadaData').value = today;
}

function deleteAttendance(id) {
    if (confirm('Deseja excluir este registro de chamada?')) {
        globalAttendance = globalAttendance.filter(r => r.id !== id);
        saveData();
        renderAttendanceHistory();
    }
}

function getFilteredAttendances() {
    const dtInicio = document.getElementById('filterDataInicio').value;
    const dtFim = document.getElementById('filterDataFim').value;

    let filtered = [...globalAttendance];

    if (dtInicio) {
        filtered = filtered.filter(r => r.data >= dtInicio);
    }
    if (dtFim) {
        filtered = filtered.filter(r => r.data <= dtFim);
    }

    return filtered;
}

function clearDateFilter() {
    document.getElementById('filterDataInicio').value = '';
    document.getElementById('filterDataFim').value = '';
    renderAttendanceHistory();
}

function renderAttendanceHistory() {
    const tbody = document.getElementById('attendanceTableBody');
    tbody.innerHTML = '';

    const records = getFilteredAttendances();

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-msg">Nenhuma chamada encontrada para o período selecionado.</td></tr>`;
        return;
    }

    records.sort((a, b) => b.data.localeCompare(a.data));

    records.forEach(record => {
        const tr = document.createElement('tr');
        const dataFormatada = record.data ? record.data.split('-').reverse().join('/') : '-';
        const qtdPresentes = record.presentes ? record.presentes.length : 0;
        
        tr.innerHTML = `
            <td><strong>${dataFormatada}</strong></td>
            <td>${record.turma}</td>
            <td><span style="color:#84cc16; font-weight:bold;">${qtdPresentes} presente(s)</span></td>
            <td><small style="color:#ccc;">${record.obs || '-'}</small></td>
            <td style="white-space: nowrap;">
                <button class="btn-action btn-view" onclick="viewAttendance('${record.id}')">Detalhes</button>
                <button class="btn-action btn-edit" onclick="editAttendance('${record.id}')">Editar</button>
                <button class="btn-action btn-delete" onclick="deleteAttendance('${record.id}')">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function viewAttendance(id) {
    const record = globalAttendance.find(r => r.id === id);
    if (!record) return;

    const turmaAthletes = globalAthletes.filter(a => a.turma === record.turma && (!a.dataCadastro || a.dataCadastro <= record.data));
    const dataFormatada = record.data ? record.data.split('-').reverse().join('/') : '-';
    const presentesList = record.presentes || [];

    const presentes = turmaAthletes.filter(a => presentesList.includes(a.nome));
    const ausentes = turmaAthletes.filter(a => !presentesList.includes(a.nome));

    let presentesHtml = presentes.length > 0 
        ? presentes.map(p => {
            const dtNasc = p.dataNasc ? p.dataNasc.split('-').reverse().join('/') : '-';
            return `<li style="margin-left:20px; color:#84cc16; margin-bottom:4px;">✔ <strong>${p.nome}</strong> (${p.apelido || ''}) - ${dtNasc}</li>`;
          }).join('')
        : '<p style="color:#aaa; font-style:italic;">Nenhum presente.</p>';

    let ausentesHtml = ausentes.length > 0 
        ? ausentes.map(a => {
            const dtNasc = a.dataNasc ? a.dataNasc.split('-').reverse().join('/') : '-';
            return `<li style="margin-left:20px; color:#ef4444; margin-bottom:4px;">✖ <strong>${a.nome}</strong> (${a.apelido || ''}) - ${dtNasc}</li>`;
          }).join('')
        : '<p style="color:#aaa; font-style:italic;">Nenhuma falta.</p>';

    document.getElementById('modalDetails').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
            <h3 style="color:#fff;">Chamada - ${dataFormatada}</h3>
            <button class="primary" style="padding:6px 12px; font-size:0.85rem;" onclick="openSingleAttendanceTab('${record.id}')">🚀 Abrir / Gerar PDF</button>
        </div>
        <p style="color:#aaa; margin-bottom:5px;">Turma: <strong>${record.turma}</strong></p>
        <p style="color:#aaa; margin-bottom:10px;"><strong>Observação do Treino:</strong> ${record.obs || '-'}</p>
        <hr style="border:0; border-top:1px solid #333; margin:15px 0;">
        <h4 style="color:#84cc16;">Atletas Presentes (${presentes.length}):</h4>
        <ul style="list-style:none; padding:0;">${presentesHtml}</ul>
        <hr style="border:0; border-top:1px dashed #333; margin:15px 0;">
        <h4 style="color:#ef4444;">Atletas Ausentes / Faltas (${ausentes.length}):</h4>
        <ul style="list-style:none; padding:0;">${ausentesHtml}</ul>
    `;

    document.getElementById('modal').classList.remove('hidden');
}

// --- VISUALIZAÇÃO/COMPARTILHAMENTO DE UMA ÚNICA CHAMADA ---

function buildSingleAttendanceHTML(recordId) {
    const record = globalAttendance.find(r => r.id === recordId);
    if (!record) return null;

    const turmaAthletes = globalAthletes.filter(a => a.turma === record.turma && (!a.dataCadastro || a.dataCadastro <= record.data));
    const dataFormatada = record.data ? record.data.split('-').reverse().join('/') : '-';
    const presentesList = record.presentes || [];

    const presentes = turmaAthletes.filter(a => presentesList.includes(a.nome));
    const ausentes = turmaAthletes.filter(a => !presentesList.includes(a.nome));

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Chamada - ${dataFormatada} - Prosol Academy</title>
            <style>
                @page { size: A4 portrait; margin: 8mm; }
                body { font-family: Arial, sans-serif; color: #111; padding: 10px; line-height: 1.25; font-size: 0.8rem; background: #fff; }
                #no-print-area { display: flex; gap: 10px; margin-bottom: 15px; background: #f1f5f9; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; }
                .btn-print { background-color: #84cc16; color: #000; font-weight: bold; border: none; padding: 10px 16px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
                .btn-share-pdf { background-color: #25d366; color: #fff; font-weight: bold; border: none; padding: 10px 16px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
                .info-box { background: #f4f9eb; padding: 8px 12px; border-radius: 4px; border: 1px solid #d9f99d; margin-bottom: 12px; }
                h3 { color: #4d7c0f; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-top: 12px; font-size: 0.9rem; }
                ul { list-style-type: none; padding-left: 0; margin-top: 4px; }
                li { padding: 3px 0; border-bottom: 1px dotted #eee; font-size: 0.78rem; }
                .presente { color: #15803d; font-weight: bold; }
                .falta { color: #b91c1c; font-weight: bold; }
                @media print { #no-print-area { display: none !important; } body { padding: 0; } }
            </style>
            ${getPDFScriptTag()}
        </head>
        <body>
            <div id="no-print-area">
                <button class="btn-share-pdf" onclick="sharePagePDF('Chamada_Prosol_${record.data}.pdf', 'portrait')">📥 BAIXAR ESTA CHAMADA EM PDF</button>
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF Nativo</button>
            </div>

            <div id="pdf-content-area">
                ${generatePrintHeader()}
                
                <div class="info-box">
                    <p style="margin:0 0 3px;"><strong>Data da Aula:</strong> ${dataFormatada}</p>
                    <p style="margin:0 0 3px;"><strong>Turma:</strong> ${record.turma}</p>
                    <p style="margin:0;"><strong>Informação / Observação do Treino:</strong> ${record.obs || 'Nenhuma observação informada.'}</p>
                </div>

                <h3>Atletas Presentes (${presentes.length})</h3>
                <ul>
                    ${presentes.length > 0 
                        ? presentes.map(p => `<li class="presente">✔ ${p.nome} (${p.apelido || ''}) - ${p.dataNasc ? p.dataNasc.split('-').reverse().join('/') : '-'}</li>`).join('') 
                        : '<li>Nenhum atleta presente registrado.</li>'}
                </ul>

                <h3>Atletas Ausentes / Faltas (${ausentes.length})</h3>
                <ul>
                    ${ausentes.length > 0 
                        ? ausentes.map(a => `<li class="falta">✖ ${a.nome} (${a.apelido || ''}) - ${a.dataNasc ? a.dataNasc.split('-').reverse().join('/') : '-'}</li>`).join('') 
                        : '<li>Nenhuma falta registrada.</li>'}
                </ul>
            </div>
        </body>
        </html>
    `;
}

function openSingleAttendanceTab(recordId) {
    const htmlContent = buildSingleAttendanceHTML(recordId);
    if (!htmlContent) return;

    const printWin = window.open('', '_blank');
    printWin.document.write(htmlContent);
    printWin.document.close();
    printWin.focus();
}

// --- VISUALIZAÇÃO/COMPARTILHAMENTO DE CHAMADAS FILTRADAS ---

function buildFilteredAttendancesHTML() {
    const records = getFilteredAttendances();
    if (records.length === 0) return null;

    records.sort((a, b) => b.data.localeCompare(a.data));

    const dtIni = document.getElementById('filterDataInicio').value;
    const dtFim = document.getElementById('filterDataFim').value;
    let periodoTexto = "Todas as chamadas cadastradas";

    if (dtIni || dtFim) {
        const iFmt = dtIni ? dtIni.split('-').reverse().join('/') : 'Início';
        const fFmt = dtFim ? dtFim.split('-').reverse().join('/') : 'Atual';
        periodoTexto = `Período de ${iFmt} até ${fFmt}`;
    }

    let recordsHtml = '';

    records.forEach(record => {
        const turmaAthletes = globalAthletes.filter(a => a.turma === record.turma && (!a.dataCadastro || a.dataCadastro <= record.data));
        const dataFormatada = record.data ? record.data.split('-').reverse().join('/') : '-';
        const presentesList = record.presentes || [];

        const presentes = turmaAthletes.filter(a => presentesList.includes(a.nome));
        const ausentes = turmaAthletes.filter(a => !presentesList.includes(a.nome));

        recordsHtml += `
            <div style="page-break-inside: avoid; border: 1px solid #d9f99d; padding: 10px; border-radius: 4px; margin-bottom: 12px; background: #fafdf5;">
                <h2 style="margin: 0 0 6px; color: #4d7c0f; font-size: 0.95rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px;">
                    📅 Aula: ${dataFormatada} - Turma: ${record.turma}
                </h2>
                <p style="margin: 0 0 6px; font-size: 0.78rem; color: #444;">
                    <strong>Observações do Treino:</strong> ${record.obs || 'Nenhuma'}
                </p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <h4 style="margin: 3px 0; color: #15803d; font-size:0.8rem;">Presentes (${presentes.length}):</h4>
                        <ul style="padding-left: 12px; margin: 0; font-size: 0.75rem;">
                            ${presentes.length > 0 
                                ? presentes.map(p => `<li style="color:#15803d;">✔ ${p.nome} (${p.apelido || ''}) - ${p.dataNasc ? p.dataNasc.split('-').reverse().join('/') : '-'}</li>`).join('')
                                : '<li style="color:#888;">Nenhum</li>'}
                        </ul>
                    </div>
                    <div>
                        <h4 style="margin: 3px 0; color: #b91c1c; font-size:0.8rem;">Ausentes (${ausentes.length}):</h4>
                        <ul style="padding-left: 12px; margin: 0; font-size: 0.75rem;">
                            ${ausentes.length > 0 
                                ? ausentes.map(a => `<li style="color:#b91c1c;">✖ ${a.nome} (${a.apelido || ''}) - ${a.dataNasc ? a.dataNasc.split('-').reverse().join('/') : '-'}</li>`).join('')
                                : '<li style="color:#888;">Nenhum</li>'}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    });

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Relatório de Chamadas - Prosol Academy</title>
            <style>
                @page { size: A4 portrait; margin: 8mm; }
                body { font-family: Arial, sans-serif; color: #111; padding: 10px; line-height: 1.25; font-size: 0.8rem; background: #fff; }
                #no-print-area { display: flex; gap: 10px; margin-bottom: 15px; background: #f1f5f9; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; }
                .btn-print { background-color: #84cc16; color: #000; font-weight: bold; border: none; padding: 10px 16px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
                .btn-share-pdf { background-color: #25d366; color: #fff; font-weight: bold; border: none; padding: 10px 16px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
                @media print { #no-print-area { display: none !important; } body { padding: 0; } }
            </style>
            ${getPDFScriptTag()}
        </head>
        <body>
            <div id="no-print-area">
                <button class="btn-share-pdf" onclick="sharePagePDF('Relatorio_Chamadas_Prosol.pdf', 'portrait')">📥 BAIXAR ESTE RELATÓRIO EM PDF</button>
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF Nativo</button>
            </div>

            <div id="pdf-content-area">
                ${generatePrintHeader()}
                <p style="font-size: 0.9rem; font-weight: bold; margin-bottom: 12px; color: #333;">
                    📋 ${periodoTexto} (${records.length} registro(s))
                </p>
                ${recordsHtml}
            </div>
        </body>
        </html>
    `;
}

function openFilteredAttendancesTab() {
    const htmlContent = buildFilteredAttendancesHTML();
    if (!htmlContent) {
        alert('Nenhuma chamada encontrada para abrir o relatório.');
        return;
    }

    const printWin = window.open('', '_blank');
    printWin.document.write(htmlContent);
    printWin.document.close();
    printWin.focus();
}

// --- RELATÓRIO DE FREQUÊNCIA ---

function renderAttendanceReport() {
    const tbody = document.getElementById('reportTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (globalAthletes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-msg">Nenhum atleta cadastrado.</td></tr>`;
        return;
    }

    globalAthletes.forEach(athlete => {
        const todasAulasTurma = globalAttendance.filter(h => h.turma === athlete.turma);
        const totalAulasGeral = todasAulasTurma.length;

        const aulasPosCadastro = todasAulasTurma.filter(h => !athlete.dataCadastro || h.data >= athlete.dataCadastro);
        const totalAulasPos = aulasPosCadastro.length;

        const presencas = todasAulasTurma.filter(h => h.presentes && h.presentes.includes(athlete.nome)).length;
        const faltasPos = totalAulasPos - presencas;

        const pctPos = totalAulasPos > 0 ? Math.round((presencas / totalAulasPos) * 100) : 0;
        const pctGeral = totalAulasGeral > 0 ? Math.round((presencas / totalAulasGeral) * 100) : 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${athlete.nome}</strong></td>
            <td><span style="background:#2a2a2a; padding:4px 8px; border-radius:4px; font-size:0.85rem;">${athlete.turma}</span></td>
            <td><strong style="color:#84cc16;">${presencas}</strong></td>
            <td><strong style="color:#ef4444;">${faltasPos}</strong></td>
            <td>
                <span style="font-weight:bold; color: ${pctPos >= 75 ? '#84cc16' : (pctPos >= 50 ? '#f59e0b' : '#ef4444')};">
                    ${pctPos}%
                </span>
            </td>
            <td>
                <span style="color:#aaa;">
                    ${pctGeral}%
                </span>
            </td>
            <td>
                <button class="btn-action btn-view" title="Ver dias" onclick="viewAthleteDates('${athlete.id}')">🔍</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function viewAthleteDates(athleteId) {
    const athlete = globalAthletes.find(a => a.id === athleteId);
    if (!athlete) return;

    const turmasAulas = globalAttendance.filter(h => h.turma === athlete.turma && (!athlete.dataCadastro || h.data >= athlete.dataCadastro));

    let datesListHtml = '';

    if (turmasAulas.length === 0) {
        datesListHtml = '<p style="color:#aaa; font-style:italic;">Nenhuma aula registrada após o cadastro deste atleta.</p>';
    } else {
        datesListHtml = '<div style="max-height:250px; overflow-y:auto; margin-top:10px;">';
        turmasAulas.forEach(aula => {
            const foiPresente = aula.presentes && aula.presentes.includes(athlete.nome);
            const dataFormatada = aula.data ? aula.data.split('-').reverse().join('/') : '-';

            let statusTag = '';
            let borderStyle = '';

            if (foiPresente) {
                statusTag = '<span style="font-weight:bold; color:#84cc16;">✔ PRESENTE</span>';
                borderStyle = 'border-left:4px solid #84cc16;';
            } else {
                statusTag = '<span style="font-weight:bold; color:#ef4444;">✖ FALTA</span>';
                borderStyle = 'border-left:4px solid #ef4444;';
            }
            
            datesListHtml += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#222; padding:8px 12px; border-radius:6px; margin-bottom:6px; ${borderStyle}">
                    <span>📅 <strong>${dataFormatada}</strong> <small style="color:#aaa; margin-left:8px;">(${aula.obs || 'Sem obs'})</small></span>
                    ${statusTag}
                </div>
            `;
        });
        datesListHtml += '</div>';
    }

    const dataCadFormatada = athlete.dataCadastro ? athlete.dataCadastro.split('-').reverse().join('/') : '-';

    document.getElementById('modalDetails').innerHTML = `
        <h3 style="color:#fff;">🔍 Histórico de Presenças (Pós-Cadastro)</h3>
        <h4 style="color:#84cc16;">${athlete.nome}</h4>
        <p style="color:#aaa; font-size:0.85rem;">Turma: ${athlete.turma} | Cadastro em: ${dataCadFormatada}</p>
        <hr style="border:0; border-top:1px solid #333; margin:10px 0;">
        ${datesListHtml}
    `;

    document.getElementById('modal').classList.add('hidden'); // Corrigido para abrir o modal em vez de fechar
    document.getElementById('modal').classList.remove('hidden');
}