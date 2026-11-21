// Produtos do estoque do NuvemVet para a CONTAGEM DO SÁBADO no app — roda na aba do NuvemVet (logado).
// Só LÊ o "Relatório de Produtos e Estoque" (relatorio_produtos_estoque.php).
// Resultado em window.__PRODUTOS = { atualizado, itens: [{ id, nome, grupo, sis, un }] }
//   sis = "Qtd Disponíveis" no sistema (o app mostra a diferença só para o Paulo).
// Grave JSON.stringify(window.__PRODUTOS) em produtos.json e rode:
//   python3 semana.py produtos ../dados.enc <chave> produtos.json   (ou passe produtos.json como 5º argumento do publicar)
(async () => {
  const r = await fetch('/admin/relatorio_produtos_estoque.php', { credentials: 'include' });
  const d = new DOMParser().parseFromString(await r.text(), 'text/html');
  const t = [...d.querySelectorAll('table')].find((x) => /Qtd Dispon/i.test(x.rows[0] ? x.rows[0].innerText : ''));
  if (!t) { window.__ERR = 'não achei a tabela de produtos (está logado?)'; return window.__ERR; }
  const cab = [...t.rows[0].cells].map((c) => c.innerText.trim());
  const iDisp = cab.findIndex((c) => /Qtd Dispon/i.test(c));
  const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
  const id = (n) => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const itens = [...t.rows].slice(1).map((x) => {
    const nome = x.cells[0].innerText.replace(/\s+/g, ' ').trim();
    return { id: id(nome), nome, grupo: '', sis: num(x.cells[iDisp].innerText), un: /UNIDADE/i.test(nome) ? 'unidade' : '' };
  }).filter((p) => p.nome);
  window.__PRODUTOS = { atualizado: new Date().toISOString(), itens };
  return itens.length + ' produtos';
})();
