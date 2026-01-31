# Project Structure

## Root Directory
```
├── package.json          # Dependencies and npm scripts
├── package-lock.json     # Dependency lock file
├── public/              # Static frontend files
├── server/              # Backend Node.js application
└── scripts/             # Utility scripts
```

## Frontend (`/public`)
- **index.html**: Main application with landing page and chat interface
- **dashboard.html**: Alternative entry point (bypasses landing)
- **admin.html**: Real-time admin dashboard for monitoring users
- **login.html**: Authentication page (if needed)
- **terms.html & privacy.html**: Legal pages
- **app.js**: Main client-side application logic
- **style.css**: Complete styling for all pages

## Backend (`/server`)
- **server.js**: Main Express server with Socket.IO integration
- **matchmaking.js**: Smart pairing algorithm and queue management
- **New folder/**: Empty directory (can be removed)

## Key Architectural Decisions

### File Organization
- **Single-page app**: Main functionality in `index.html` + `app.js`
- **Shared styles**: One `style.css` for all pages
- **Modular backend**: Matchmaking logic separated from server logic

### State Management
- **Server-side**: In-memory objects for users, queues, reports, bans
- **Client-side**: DOM-based state with Socket.IO event handling
- **No database**: All data is ephemeral and session-based

### Code Conventions
- **CommonJS**: Use `require()` and `module.exports`
- **Event-driven**: Socket.IO events for all real-time features
- **Vanilla JS**: No frontend frameworks, direct DOM manipulation
- **CSS Grid**: Main layout uses CSS Grid with responsive fallbacks
- **Simple Matching**: Prioritize country > gender > timezone compatibility
- **Conversation Features**: Random starters and quick message integration

### Naming Patterns
- **Socket events**: kebab-case (`find-partner`, `chat-message`)
- **DOM IDs**: camelCase (`chatInput`, `startBtn`, `countrySelect`)
- **CSS classes**: kebab-case (`chat-message`, `primary-btn`, `quick-msg`)
- **File names**: lowercase with hyphens for multi-word files
- **User preferences**: camelCase in code (`countrySelect`, `genderSelect`)