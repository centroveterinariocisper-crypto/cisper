# Lista do dia · Centro Veterinário Cisper

App da recepção com as mensagens de WhatsApp do dia (pós-atendimento, vacinas, depois do orçamento e clientes sumidos).

- **Endereço do app:** https://centroveterinariocisper-crypto.github.io/cisper/
- **Quem usa:** Débora (manhã), Duda (tarde) e Paulo (administrador). Cada um entra com a própria senha.
- **Senhas e chave do GitHub:** não ficam aqui. Ficam só com o Paulo.

## Rotina

1. Domingo e quarta à noite, o Paulo pede ao Claude: "monta a lista da semana".
2. O Claude lê o NuvemVet (só leitura) e gera o arquivo `Lista Cisper ….cisper`. Basta a senha do Paulo: o arquivo reaproveita a chave da lista publicada, então Débora e Duda continuam com as mesmas senhas. As três senhas só são necessárias para trocar alguma delas.
3. O Paulo abre o app como administrador, toca em **📤 Publicar lista nova** e escolhe o arquivo.
4. A lista aparece sozinha no app da Débora e da Duda.

## O que tem neste repositório

| Arquivo | Para que serve |
| --- | --- |
| `index.html` | O app (tela, mensagens prontas, regras de quem vê o quê) |
| `sw.js`, `manifest.webmanifest`, `*.png` | Instalar no celular em tela cheia, com o ícone da clínica |
| `dados.enc` | A lista publicada, **criptografada** (sem a senha não dá para ler) |
| `ferramentas/coleta_semana.js` | Script que o Claude roda no NuvemVet para montar a lista da semana |
| `ferramentas/publicar.py` | Gera o arquivo `.cisper` criptografado com as senhas |

## Regras da lista

- **Pós-atendimento:** consulta, aplicação, curativo, fluido ou cirurgia de 2 a 4 dias atrás, de quem não voltou. Fica de fora quem fez exame, internação ou ticket de R$ 400 ou mais, exceto cirurgia e castração, que entram sempre.
- **Vacina:** retorno vencido há até 14 dias ou que vence nos próximos dias, sem aviso marcado no NuvemVet. A mensagem sai 3 dias antes.
- **Depois do orçamento:** um contato, 2 dias depois, perguntando como o animal está, sem falar do orçamento. Fica de fora quem já pagou metade, fez exame ou ticket de R$ 400 ou mais.
- **Cliente sumido:** sem visita entre 6 meses e 2 anos, quem mais gastou primeiro, 20 por dia.
- **Para todos:** sem animal com óbito ou eutanásia; no máximo uma mensagem por semana por cliente; cliente parado só a cada 4 meses; quem tem "NÃO ENVIAR WHATSAPP" nas anotações do NuvemVet nunca entra.
- **Divisão:** Débora fica com pós-atendimento, vacinas, depois do orçamento e os 10 primeiros clientes sumidos. Duda fica com os outros clientes sumidos.

## Lembretes

- A chave do GitHub usada para publicar vence em **01/01/2027**. Criar outra em github.com/settings/personal-access-tokens/new (repositório `cisper`, permissão Contents: Read and write) e trocar no app em "Trocar chave do GitHub".
- **Acompanhamento (adm):** aba "📊 Acompanhamento" mostra o que cada uma fez e não fez no dia e o total da semana. As marcações são gravadas, criptografadas, no repositório privado `cisper-marcas`, com uma chave própria (Contents: Read and write só nesse repositório). Essa chave vai criptografada dentro da lista publicada; sem ela, cada celular vê só as próprias marcações.
- Visual "Maré Mansa": fontes Outfit e Instrument Serif (licença OFL, pasta `fonts/`).
