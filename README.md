# Racha 2026

Classificação da pelada — site estático (Vercel) com dados e login guardados
no Supabase.

## Como funciona

- `app.js`, `style.css`, `body_shell.html` — o app (lógica, estilo e markup).
- `live_state.json` — snapshot inicial (usado só no build, como base caso o
  Supabase esteja fora do ar). Os dados de verdade, depois do primeiro
  deploy, ficam no Supabase.
- `build.js` — monta tudo isso num único `public/index.html`. É esse
  comando (`node build.js`) que o Vercel roda no deploy (ver
  `vercel.json`) — não precisa gerar nada antes de commitar.
- `build.py` — mesma coisa, versão em Python, só pra uso local/manual e
  pra gerar `artifact_source.html` (formato usado se este app for
  republicado como Claude Artifact). Não é usado pelo Vercel.

O site é **público pra leitura** — qualquer pessoa com o link vê a
classificação, mas não vê botão de editar nada. Só quem tem a senha de
admin consegue editar: clique em "Entrar" no topo da página, digite a
senha, e os botões de edição aparecem. As mudanças são salvas direto no
Supabase e aparecem pra todo mundo na hora, sem precisar de novo deploy.

A senha é conferida no servidor (função do Postgres/Supabase) — nunca fica
salva em texto puro em lugar nenhum, nem no código publicado.

Pra mudar o app em si (layout, regras de pontuação, etc.) aí sim precisa
editar o código e dar `git push` — o Vercel publica automaticamente a cada
push na branch principal.

## Rodando local

```
node build.js
python3 -m http.server -d public 8000
```
