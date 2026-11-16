// Receitas para conferir as doses — roda na aba do NuvemVet (sistema.nuvemvet.com/admin/...), logado. Só LÊ.
// Antes de rodar, defina: window.__RX_DE = 'DD-MM-AAAA'; window.__RX_ATE = 'DD-MM-AAAA';
// Resultado fica em window.__RX = [{ id, cid, aid, cliente, animal, data, vet, especie, peso, idade, rx }]
// O Claude lê cada receita, calcula a dose em mg/kg e compara com a literatura (Plumb's, Viana, bula).
// O que estiver fora da faixa vira um aviso em alertas.json, que vai só para o perfil do Paulo
// (python3 publicar.py ... base=dados.enc adm=<senha> alertas=alertas.json).
(async () => {
  const de = window.__RX_DE, ate = window.__RX_ATE;
  if (!de || !ate) return 'faltou window.__RX_DE / window.__RX_ATE';
  const doc = async (u) => new DOMParser().parseFromString(await fetch(u).then(r => r.text()), 'text/html');
  const rel = await doc(`relatorio_receituarios.php?data_inicio=${de}&data_final=${ate}`);
  const out = [];
  for (const tr of rel.querySelectorAll('table tbody tr')) {
    const td = [...tr.querySelectorAll('td')].map(x => x.textContent.trim().replace(/\s+/g, ' '));
    if (td.length < 10 || /cancel/i.test(td[5])) continue;
    const href = tr.querySelector('a[href*="imprimir_receita"]')?.getAttribute('href'); if (!href) continue;
    const d = await doc(href); d.querySelectorAll('script,style').forEach(x => x.remove());
    const t = d.body.textContent.replace(/[\t ]+/g, ' ').replace(/\n\s*\n+/g, '\n');
    const g = (re) => ((t.match(re) || [])[1] || '').trim();
    const rx = ((t.split(/Data: \d{2}-\d{2}-\d{4}/)[1] || '').split('Médico Veterinário')[0] || '').replace(/INSTRUÇÕES GERAIS DO TRATAMENTO[\s\S]*$/, '').trim();
    if (!/\d+\s*\./.test(rx)) continue; // só receitas com medicamento (pula pedido de exame, encaminhamento, dieta)
    out.push({ id: (href.match(/[?&]id=(\d+)/) || [])[1], cid: (href.match(/id_cliente=(\d+)/) || [])[1], aid: (href.match(/id_animal=(\d+)/) || [])[1],
      cliente: td[0], animal: td[1], data: td[2], vet: td[9], especie: g(/Espécie:\s*\n?(.+)/), peso: g(/Peso:\s*\n?(.+)/), idade: g(/Idade:\s*\n?(.+)/), rx });
  }
  window.__RX = out;
  return out.length + ' receitas com medicamento';
})()
