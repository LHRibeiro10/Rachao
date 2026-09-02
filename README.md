# Racha 2026

Classificação da pelada — site estático, sem backend e sem banco de dados.

## Como funciona

- `app.js`, `style.css`, `body_shell.html` — o app (lógica, estilo e markup).
- `live_state.json` — os dados de verdade: atletas, rodadas e pontuação.
- `build.py` — monta tudo isso num único `public/index.html`, pronto pra
  publicar. É esse arquivo que o Vercel serve.

O site publicado é **somente leitura** — não tem login nem edição pelo
navegador. Pra atualizar a tabela (nova rodada, resultado, atleta novo
etc.), edite `live_state.json` (ou peça pra Claude atualizar), rode:

```
python3 build.py
```

e suba a mudança (commit + push). Com o projeto conectado ao Vercel, cada
push na branch principal publica a versão nova automaticamente.

## Rodando local

Abra `public/index.html` direto no navegador, ou sirva a pasta:

```
python3 -m http.server -d public 8000
```
