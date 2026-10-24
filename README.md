# tailroom

Software para leitura de arquivos de logs em tempo real (estilo `tail -f`), direto no navegador.

O tailroom é uma aplicação web (SPA) que permite abrir arquivos `.log` / `.txt` locais ou URLs remotas e acompanhar seu conteúdo conforme ele cresce, com filtros por nível, busca por múltiplos termos e visualização da linha completa. O acesso é feito por login com conta Google, via Supabase Auth.

## Funcionalidades

- **Login com Google** (OAuth) **ou e-mail e senha** (com confirmação de e-mail e recuperação de senha), com sessão renovada automaticamente.
- **Multiusuário**: preferências, termos de busca e histórico de URLs ficam salvos por usuário no Supabase e isolados por RLS.
- **Abertura de arquivos locais** via seletor de arquivos do navegador ou arrastando e soltando o arquivo na tela.
- **Acompanhamento ao vivo (live tail)** de arquivos locais: o app verifica o arquivo a cada 1 segundo e adiciona apenas o conteúdo novo.
- **Abertura de logs remotos por URL** (HTTP/HTTPS), atualizados a cada 1 segundo.
- **Histórico** de arquivos (na sessão) e URLs (salvas na conta), com remoção individual.
- **Filtros**:
  - por nível: `ALL`, `INFO`, `WARN`, `ERROR`, `DEBUG` (detectado pelo texto da linha);
  - busca por um ou mais termos (aparece toda linha que contiver pelo menos um dos termos);
  - diferenciação entre maiúsculas e minúsculas;
  - destaque dos termos encontrados.
- **Controles de visualização**: pausar/retomar, modo *Follow* (rolagem automática), números de linha, quebra de linha e limpeza da visualização.
- **Visualização da linha completa** em um modal ao clicar em uma linha.
- Formatação automática de conteúdo JSON válido.

## Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) como bundler e servidor de desenvolvimento
- [Supabase](https://supabase.com/) (autenticação Google e e-mail/senha, tabelas `profiles`, `user_settings` e `log_sources` com RLS)
- [lucide-react](https://lucide.dev/) para ícones
- [Nginx](https://nginx.org/) para servir o build estático em produção
- Docker / Podman para empacotamento

## Estrutura do projeto

```text
.
├── src/
│   ├── App.tsx            # Tela de login, layout, leitura e filtros dos logs
│   ├── main.tsx           # Ponto de entrada do React
│   ├── index.css          # Estilos
│   ├── lib/supabase.ts    # Cliente Supabase (lê as variáveis VITE_*)
│   ├── lib/userData.ts    # Leitura/gravação de preferências e URLs do usuário
│   └── vite-env.d.ts
├── supabase/
│   └── schema.sql         # Tabelas, políticas RLS e triggers (perfil automático, updated_at)
├── Dockerfile             # Build multi-stage: Node 24 (build) + Nginx 1.27 (runtime)
├── nginx.conf             # Headers de segurança, fallback para SPA e /healthz
├── DEPLOY.md              # Passo a passo de deploy com Podman
├── .env.example           # Modelo das variáveis de ambiente
└── vite.config.ts
```

## Pré-requisitos

- Node.js 24 (ou compatível com o Vite atual) e npm, para desenvolvimento local.
- Um projeto no [Supabase](https://supabase.com/dashboard).
- Um cliente OAuth do Google Cloud (Client ID e Client Secret) para o provedor Google.
- Podman ou Docker, para o deploy em contêiner.

## Configuração do Supabase

O tailroom é multiusuário com **dados isolados por usuário**: qualquer pessoa pode criar conta, e cada uma só enxerga os próprios dados. O isolamento é garantido no banco por Row Level Security (RLS), não pelo frontend.

### 1. Banco de dados

No **SQL Editor** do projeto, execute todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql). O script é idempotente (pode ser executado de novo sem perder dados) e cria:

| Tabela | Conteúdo | Acesso (RLS) |
| --- | --- | --- |
| `profiles` | Nome, avatar e e-mail do usuário | Lê e altera só o próprio perfil |
| `user_settings` | Nível, filtros, termos de busca, *follow*, números de linha, quebra de linha | Lê, cria e altera só as próprias preferências |
| `log_sources` | URLs remotas abertas (histórico persistente) | CRUD só nas próprias URLs |

Ele também cria o trigger `on_auth_user_created`, que gera o perfil e as preferências padrão de cada novo usuário (Google ou e-mail), e preenche esses registros para usuários que já existiam.

> Arquivos locais **não** são salvos no banco: o conteúdo nunca sai do navegador, e o navegador não permite reabrir o arquivo em outro dispositivo.

### 2. Login com Google

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um **OAuth Client ID** do tipo *Web application*.
2. Em *Authorized redirect URIs*, cadastre `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
3. No Supabase, em **Authentication > Sign In / Providers > Google**, habilite o provedor e informe o Client ID e o Client Secret.

### 3. Login com e-mail e senha

1. Em **Authentication > Sign In / Providers > Email**, confirme que o provedor está habilitado e que **Confirm email** está ligado.
2. Em **Authentication > Policies** (ou **Password**), defina o tamanho mínimo de senha para **8** (o mesmo valor validado no app) e, se quiser, exija letras e números.
3. **SMTP:** o servidor de e-mail padrão do Supabase envia poucas mensagens por hora e é só para testes. Em produção, configure um SMTP próprio em **Project Settings > Authentication > SMTP Settings** (Resend, SendGrid, Amazon SES etc.).
4. Opcional: traduza os modelos de e-mail em **Authentication > Emails** (*Confirm signup* e *Reset password*).

O app oferece cadastro, login, "Esqueci minha senha" e a tela de nova senha. O link de redefinição volta para a URL do app, que abre a tela "Defina uma nova senha".

### 4. URLs permitidas

Em **Authentication > URL Configuration**:

- **Site URL:** a URL pública de produção (por exemplo, `https://tailroom.suaempresa.com`).
- **Redirect URLs:** todas as origens em que o app roda, por exemplo `http://localhost:5173`, `http://127.0.0.1:5173` e a URL de produção.

Os links de confirmação de e-mail, de redefinição de senha e o retorno do Google só funcionam para origens dessa lista.

### 5. Chaves

Em **Project Settings > API**, copie a **Project URL** e a chave **anon / publishable** para as variáveis abaixo.

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase (`https://SEU-PROJETO.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | Chave pública `anon` do Supabase. |

Crie um arquivo `.env.local` na raiz (não versione) a partir de `.env.example`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

> **Atenção:** use somente a chave `anon` no frontend. A chave `service_role` nunca deve ser exposta no navegador. Como as variáveis `VITE_*` são embutidas no bundle durante o build, a chave `anon` fica visível para quem acessa o site; a proteção dos dados depende das políticas RLS.

Se as variáveis não estiverem definidas, a aplicação abre normalmente, mas o botão de login fica desabilitado com um aviso.

## Desenvolvimento local

```bash
npm install
npm run dev
```

A aplicação fica disponível em `http://localhost:5173/` (o Vite exibe a URL exata no terminal).

Outros scripts:

```bash
npm run build     # Type-check (tsc -b) e build de produção em dist/
npm run preview   # Serve o build de dist/ localmente
```

## Deploy com contêiner

O `Dockerfile` faz o build com Node 24 e publica os arquivos estáticos em um Nginx 1.27. As variáveis do Supabase entram como *build args*, pois são embutidas no bundle.

### Build

```powershell
podman build -t tailroom:latest --build-arg VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co --build-arg VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica .
```

### Executar

```powershell
podman run -d --replace --name tailroom -p 5173:80 localhost/tailroom:latest
```

Acesse `http://127.0.0.1:5173/`.

### Verificar

```powershell
podman ps
Invoke-WebRequest http://127.0.0.1:5173/healthz
```

O endpoint `/healthz` responde `ok`. O contêiner também possui um `HEALTHCHECK` que consulta a raiz do site.

### Parar e remover

```powershell
podman stop tailroom
podman rm tailroom
```

Com Docker, substitua `podman` pelo comando `docker` equivalente.

## Segurança

O `nginx.conf` envia os seguintes cabeçalhos:

- `Content-Security-Policy` restrita a `self`, com exceções para Supabase e Google (login) e para Google Fonts;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` desabilitando câmera, microfone e geolocalização.

Observações:

- O isolamento entre usuários depende de RLS nas tabelas `profiles`, `user_settings` e `log_sources`; não desabilite as políticas. Ao criar novas tabelas com dados de usuário, habilite RLS e filtre por `auth.uid()`.
- Os arquivos abertos são lidos integralmente no navegador e não são enviados a nenhum servidor pelo tailroom.

## Limitações conhecidas

- **Acompanhamento ao vivo de arquivos locais** usa a API *File System Access* (`showOpenFilePicker`), disponível em navegadores baseados em Chromium. Em outros navegadores, o arquivo é apenas carregado uma vez, sem acompanhamento.
- **URLs remotas** precisam permitir CORS para a origem da aplicação. Caso contrário, o app exibe erro de CORS.
- **URLs remotas** são baixadas inteiras a cada segundo; para logs muito grandes, isso consome banda e memória.
- O botão de configurações no topo ainda não possui ações.

## Licença

Projeto privado. Defina a licença antes de distribuí-lo.
