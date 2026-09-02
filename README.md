# Racha 2026

Classificação da pelada — site estático, sem backend e sem banco de dados.

## Como funciona

- `app.js`, `style.css`, `body_shell.html` — o app (lógica, estilo e markup).
- `live_state.json` — os dados de verdade: atletas, rodadas e pontuação.
- `build.js` — monta tudo isso num único `public/index.html`. É esse
  comando (`node build.js`) que o Vercel roda no deploy (ver
  `vercel.json`) — não precisa gerar nada antes de commitar.
- `build.py` — mesma coisa, versão em Python, só pra uso local/manual e
  pra gerar `artifact_source.html` (formato usado se este app for
  republicado como Claude Artifact). Não é usado pelo Vercel.

O site publicado é **somente leitura** — não tem login nem edição pelo
navegador. Pra atualizar a tabela (nova rodada, resultado, atleta novo
etc.), edite `live_state.json` (ou peça pra Claude atualizar) e suba a
mudança (commit + push). Com o projeto conectado ao Vercel, cada push na
branch principal publica a versão nova automaticamente.

## Rodando local

```
node build.js
python3 -m http.server -d public 8000
```
