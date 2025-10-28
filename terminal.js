const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { WebLinksAddon } = require('xterm-addon-web-links');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

class TerminalApp {
  constructor() {
    this.tabs = [];
    this.activeTab = null;
    this.showHistory = false;
    this.commandHistory = [];
    this.selectedText = '';
    this.nextTabId = 1;
    
    // Settings
    this.settings = {
      fontFamily: 'JetBrains Mono',
      fontSize: 14,
      theme: 'github-dark'
    };
    
    this.themes = {
      'github-dark': {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc'
      },
      'dracula': {
        background: '#282a36',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff'
      },
      'monokai': {
        background: '#272822',
        foreground: '#f8f8f2',
        cursor: '#f8f8f0',
        black: '#272822',
        red: '#f92672',
        green: '#a6e22e',
        yellow: '#f4bf75',
        blue: '#66d9ef',
        magenta: '#ae81ff',
        cyan: '#a1efe4',
        white: '#f8f8f2',
        brightBlack: '#75715e',
        brightRed: '#f92672',
        brightGreen: '#a6e22e',
        brightYellow: '#f4bf75',
        brightBlue: '#66d9ef',
        brightMagenta: '#ae81ff',
        brightCyan: '#a1efe4',
        brightWhite: '#f9f8f5'
      },
      'solarized-dark': {
        background: '#002b36',
        foreground: '#839496',
        cursor: '#839496',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5',
        brightBlack: '#002b36',
        brightRed: '#cb4b16',
        brightGreen: '#586e75',
        brightYellow: '#657b83',
        brightBlue: '#839496',
        brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1',
        brightWhite: '#fdf6e3'
      },
      'nord': {
        background: '#2e3440',
        foreground: '#d8dee9',
        cursor: '#d8dee9',
        black: '#3b4252',
        red: '#bf616a',
        green: '#a3be8c',
        yellow: '#ebcb8b',
        blue: '#81a1c1',
        magenta: '#b48ead',
        cyan: '#88c0d0',
        white: '#e5e9f0',
        brightBlack: '#4c566a',
        brightRed: '#bf616a',
        brightGreen: '#a3be8c',
        brightYellow: '#ebcb8b',
        brightBlue: '#81a1c1',
        brightMagenta: '#b48ead',
        brightCyan: '#8fbcbb',
        brightWhite: '#eceff4'
      }
    };
    
    // Cache DOM elements
    this.tabsContainer = document.getElementById('tabs-container');
    this.terminalArea = document.getElementById('terminal-area');
    this.historyToggle = document.getElementById('history-toggle');
    this.historySidebar = document.getElementById('history-sidebar');
    this.historyList = document.getElementById('history-list');
    this.settingsToggle = document.getElementById('settings-toggle');
    this.settingsPanel = document.getElementById('settings-panel');
    this.contextMenu = document.getElementById('context-menu');
    this.historyContextMenu = document.getElementById('history-context-menu');
    this.clearConsoleBtn = document.getElementById('clear-console');
    this.clearInputBtn = document.getElementById('clear-input');
    this.killProcessBtn = document.getElementById('kill-process');
    
    this.init();
  }

  init() {
    this.loadSettings();
    this.addTab();
    this.attachGlobalEvents();
    this.startHistoryMonitor();
  }

  loadSettings() {
    // Load settings from localStorage if available
    const saved = localStorage.getItem('terminalSettings');
    if (saved) {
      this.settings = { ...this.settings, ...JSON.parse(saved) };
    }
    
    // Update UI
    const fontFamilySelect = document.getElementById('font-family');
    const fontSizeInput = document.getElementById('font-size');
    const themeSelect = document.getElementById('theme');
    
    if (fontFamilySelect) fontFamilySelect.value = this.settings.fontFamily;
    if (fontSizeInput) fontSizeInput.value = this.settings.fontSize;
    if (themeSelect) themeSelect.value = this.settings.theme;
    
    document.getElementById('font-size-value').textContent = this.settings.fontSize;
  }

  saveSettings() {
    localStorage.setItem('terminalSettings', JSON.stringify(this.settings));
  }

  startHistoryMonitor() {
    // Poll bash history file every 2 seconds to update command history
    setInterval(() => {
      const fs = require('fs');
      const historyPath = path.join(os.homedir(), '.bash_history');
      
      try {
        if (fs.existsSync(historyPath)) {
          // Force bash to write history
          const tab = this.tabs.find(t => t.id === this.activeTab);
          if (tab && tab.ptyProcess) {
            // Send history -a command to append to history file
            // We do this silently by using HISTCONTROL
            const stats = fs.statSync(historyPath);
            if (!this.lastHistoryMtime || stats.mtimeMs > this.lastHistoryMtime) {
              this.lastHistoryMtime = stats.mtimeMs;
              
              const historyContent = fs.readFileSync(historyPath, 'utf8');
              const lines = historyContent.trim().split('\n').filter(l => l.trim());
              
              // Get last 50 unique commands
              const uniqueCommands = [...new Set(lines.reverse())].slice(0, 50);
              
              // Update if changed
              if (JSON.stringify(uniqueCommands) !== JSON.stringify(this.commandHistory)) {
                this.commandHistory = uniqueCommands;
                
                if (this.showHistory) {
                  this.renderHistorySidebar();
                }
              }
            }
          }
        }
      } catch (err) {
        // Silently fail
      }
    }, 1000); // Check every second for faster updates
  }

  createTerminal(cwd) {
    const currentTheme = this.themes[this.settings.theme];
    
    const term = new Terminal({
      fontFamily: `"${this.settings.fontFamily}", "Courier New", monospace`,
      fontSize: this.settings.fontSize,
      fontWeight: 400,
      fontWeightBold: 600,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: {
        background: currentTheme.background,
        foreground: currentTheme.foreground,
        cursor: currentTheme.cursor,
        cursorAccent: currentTheme.background,
        selection: '#388bfd40',
        black: currentTheme.black,
        red: currentTheme.red,
        green: currentTheme.green,
        yellow: currentTheme.yellow,
        blue: currentTheme.blue,
        magenta: currentTheme.magenta,
        cyan: currentTheme.cyan,
        white: currentTheme.white,
        brightBlack: currentTheme.brightBlack,
        brightRed: currentTheme.brightRed,
        brightGreen: currentTheme.brightGreen,
        brightYellow: currentTheme.brightYellow,
        brightBlue: currentTheme.brightBlue,
        brightMagenta: currentTheme.brightMagenta,
        brightCyan: currentTheme.brightCyan,
        brightWhite: currentTheme.brightWhite
      },
      allowTransparency: false,
      scrollback: 10000
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    // Create PTY process
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: term.cols,
      rows: term.rows,
      cwd: cwd || process.env.HOME || os.homedir(),
      env: {
        ...process.env,
        PROMPT_COMMAND: 'history -a', // Force bash to append to history file immediately
        HISTFILE: path.join(os.homedir(), '.bash_history'),
        HISTFILESIZE: 10000,
        HISTSIZE: 10000
      }
    });

    // Listen for data from PTY and write to terminal
    ptyProcess.onData((data) => {
      term.write(data);
    });

    // Listen for terminal input and write to PTY
    term.onData((data) => {
      ptyProcess.write(data);
      
      // Track commands for history (detect Enter key)
      if (data === '\r') {
        this.trackCommand(term);
      }
    });

    // Handle terminal resize
    term.onResize(({ cols, rows }) => {
      ptyProcess.resize(cols, rows);
    });

    return { term, fitAddon, ptyProcess };
  }

  trackCommand(term) {
    // Use a simpler approach - capture typed commands
    const tab = this.tabs.find(t => t.term === term);
    if (!tab) return;
    
    // Commands will be tracked via shell history file
    // Read last command from bash history
    const fs = require('fs');
    const historyPath = path.join(os.homedir(), '.bash_history');
    
    try {
      if (fs.existsSync(historyPath)) {
        const historyContent = fs.readFileSync(historyPath, 'utf8');
        const lines = historyContent.trim().split('\n');
        const lastCommand = lines[lines.length - 1];
        
        if (lastCommand && lastCommand.trim() && !this.commandHistory.includes(lastCommand)) {
          this.commandHistory = [lastCommand, ...this.commandHistory.filter(cmd => cmd !== lastCommand)].slice(0, 50);
          
          if (this.showHistory) {
            this.renderHistorySidebar();
          }
        }
      }
    } catch (err) {
      // Silently fail if we can't read history
    }
  }

  addTab() {
    const tabId = this.nextTabId++;
    const cwd = this.tabs.length > 0 ? this.tabs[this.tabs.length - 1].cwd : os.homedir();
    
    const { term, fitAddon, ptyProcess } = this.createTerminal(cwd);
    
    const tab = {
      id: tabId,
      name: `Terminal ${tabId}`,
      term: term,
      fitAddon: fitAddon,
      ptyProcess: ptyProcess,
      element: null,
      terminalElement: null,
      cwd: cwd
    };
    
    this.tabs.push(tab);
    this.renderTabs();
    this.switchTab(tabId);
  }

  renderTabs() {
    this.tabsContainer.innerHTML = '';
    
    this.tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `tab ${tab.id === this.activeTab ? 'active' : ''}`;
      tabEl.dataset.tabId = tab.id;
      
      const icon = document.createElement('span');
      icon.className = 'tab-icon';
      icon.innerHTML = '▶';
      tabEl.appendChild(icon);
      
      const span = document.createElement('span');
      span.textContent = tab.name;
      tabEl.appendChild(span);
      
      if (this.tabs.length > 1) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-tab';
        closeBtn.textContent = '✕';
        closeBtn.dataset.tabId = tab.id;
        tabEl.appendChild(closeBtn);
      }
      
      // Add detach button
/*       const detachBtn = document.createElement('button');
      detachBtn.className = 'detach-tab';
      detachBtn.innerHTML = '⧉';
      detachBtn.title = 'Detach tab to new window';
      detachBtn.dataset.tabId = tab.id;
      tabEl.appendChild(detachBtn); */
      
      this.tabsContainer.appendChild(tabEl);
      tab.element = tabEl;
    });
    
    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab';
    addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`;
    this.tabsContainer.appendChild(addBtn);
  }

  switchTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    // Hide all terminals
    this.tabs.forEach(t => {
      if (t.terminalElement) {
        t.terminalElement.style.display = 'none';
      }
      if (t.element) {
        t.element.classList.remove('active');
      }
    });
    
    // Show selected terminal
    if (!tab.terminalElement) {
      tab.terminalElement = document.createElement('div');
      tab.terminalElement.className = 'terminal-wrapper';
      this.terminalArea.appendChild(tab.terminalElement);
      tab.term.open(tab.terminalElement);
      
      // Fit terminal to container
      setTimeout(() => {
        tab.fitAddon.fit();
      }, 0);
    }
    
    tab.terminalElement.style.display = 'block';
    tab.element.classList.add('active');
    this.activeTab = tabId;
    
    // Focus terminal
    tab.term.focus();
    
    // Refit on window resize
    const resizeHandler = () => {
      tab.fitAddon.fit();
    };
    window.removeEventListener('resize', tab.resizeHandler);
    tab.resizeHandler = resizeHandler;
    window.addEventListener('resize', resizeHandler);
  }

  closeTab(tabId) {
    if (this.tabs.length === 1) return;
    
    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    const tab = this.tabs[tabIndex];
    
    if (tab) {
      // Kill PTY process
      tab.ptyProcess.kill();
      
      // Dispose terminal
      tab.term.dispose();
      
      // Remove terminal element
      if (tab.terminalElement) {
        tab.terminalElement.remove();
      }
      
      // Remove resize handler
      if (tab.resizeHandler) {
        window.removeEventListener('resize', tab.resizeHandler);
      }
      
      // Remove from tabs array
      this.tabs.splice(tabIndex, 1);
      
      // Switch to another tab
      if (this.activeTab === tabId) {
        const newActiveTab = this.tabs[Math.max(0, tabIndex - 1)];
        this.switchTab(newActiveTab.id);
      }
      
      this.renderTabs();
    }
  }

  renderHistorySidebar() {
    if (this.commandHistory.length === 0) {
      this.historyList.innerHTML = '<div class="no-history">No commands yet</div>';
      return;
    }
    
    this.historyList.innerHTML = '';
    this.commandHistory.forEach(cmd => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.textContent = cmd;
      item.dataset.command = cmd;
      this.historyList.appendChild(item);
    });
  }

  executeCommand(command) {
    const tab = this.tabs.find(t => t.id === this.activeTab);
    if (!tab) return;
    
    // Auto-convert pacman to sudo pacman
    let processedCommand = command.trim();
    if (processedCommand.startsWith('pacman ') && !processedCommand.startsWith('sudo ')) {
      processedCommand = 'sudo ' + processedCommand;
    }
    
    // Send command to PTY
    tab.ptyProcess.write(processedCommand + '\r');
    
    // Add to history
    this.commandHistory = [processedCommand, ...this.commandHistory.filter(cmd => cmd !== processedCommand)].slice(0, 50);
    
    if (this.showHistory) {
      this.renderHistorySidebar();
    }
  }

  attachGlobalEvents() {
    // Tab switching
    this.tabsContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab && !e.target.classList.contains('close-tab')) {
        const tabId = parseInt(tab.dataset.tabId);
        this.switchTab(tabId);
      }
    });

    // Close tab
    this.tabsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('close-tab')) {
        e.stopPropagation();
        const tabId = parseInt(e.target.dataset.tabId);
        this.closeTab(tabId);
      }
    });

    // Detach tab
    this.tabsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('detach-tab')) {
        e.stopPropagation();
        const tabId = parseInt(e.target.dataset.tabId);
        this.detachTab(tabId);
      }
    });

    // Add tab
    this.tabsContainer.addEventListener('click', (e) => {
      if (e.target.closest('.add-tab')) {
        this.addTab();
      }
    });

    // Toggle history
    this.historyToggle.addEventListener('click', () => {
      this.showHistory = !this.showHistory;
      this.historySidebar.style.display = this.showHistory ? 'flex' : 'none';
      this.historyToggle.classList.toggle('active', this.showHistory);
      
      // Hide settings if showing history
      if (this.showHistory) {
        this.settingsPanel.style.display = 'none';
        this.settingsToggle.classList.remove('active');
        this.renderHistorySidebar();
      }
      
      // Refit terminal when sidebar toggles
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (tab) {
        setTimeout(() => {
          tab.fitAddon.fit();
          tab.term.focus();
        }, 100);
      }
    });

    // Toggle settings
    this.settingsToggle.addEventListener('click', () => {
      const isVisible = this.settingsPanel.style.display === 'flex';
      this.settingsPanel.style.display = isVisible ? 'none' : 'flex';
      this.settingsToggle.classList.toggle('active', !isVisible);
      
      // Hide history if showing settings
      if (!isVisible) {
        this.historySidebar.style.display = 'none';
        this.historyToggle.classList.remove('active');
        this.showHistory = false;
      }
      
      // Refit terminal
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (tab) {
        setTimeout(() => {
          tab.fitAddon.fit();
          tab.term.focus();
        }, 100);
      }
    });

    // Font size slider
    const fontSizeInput = document.getElementById('font-size');
    fontSizeInput.addEventListener('input', (e) => {
      document.getElementById('font-size-value').textContent = e.target.value;
    });

    // Apply settings
    document.getElementById('apply-settings').addEventListener('click', () => {
      this.applySettings();
    });

    // Clear console
    this.clearConsoleBtn.addEventListener('click', () => {
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (tab) {
        tab.term.clear();
        tab.term.focus();
      }
    });

    // Clear input (send Ctrl+U to clear current line)
    this.clearInputBtn.addEventListener('click', () => {
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (tab) {
        tab.ptyProcess.write('\x15'); // Ctrl+U
        tab.term.focus();
      }
    });

    // Kill process (send Ctrl+C)
    this.killProcessBtn.addEventListener('click', () => {
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (tab) {
        tab.ptyProcess.write('\x03'); // Ctrl+C
        tab.term.focus();
      }
    });

    // Execute from history (left click)
    this.historyList.addEventListener('click', (e) => {
      const historyItem = e.target.closest('.history-item');
      if (historyItem) {
        const command = historyItem.dataset.command;
        this.executeCommand(command);
      }
    });

    // Context menu on history items (right click)
    this.historyList.addEventListener('contextmenu', (e) => {
      const historyItem = e.target.closest('.history-item');
      if (historyItem) {
        e.preventDefault();
        this.selectedHistoryCommand = historyItem.dataset.command;
        this.showHistoryContextMenu(e.clientX, e.clientY);
      }
    });

    // Context menu
    document.addEventListener('contextmenu', (e) => {
      const tab = this.tabs.find(t => t.id === this.activeTab);
      if (!tab) return;
      
      const selection = tab.term.getSelection().trim();
      
      // Always show context menu in terminal area
      if (e.target.closest('.terminal-area')) {
        e.preventDefault();
        this.selectedText = selection;
        this.showContextMenu(e.clientX, e.clientY, !selection);
      }
    });

    // Close context menu on any click
    document.addEventListener('click', (e) => {
      // Don't close if clicking inside context menu
      if (!e.target.closest('.context-menu')) {
        this.hideContextMenu();
        this.hideHistoryContextMenu();
      }
    });

    // Handle context menu actions
    this.contextMenu.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) {
        e.stopPropagation(); // Prevent document click from firing
        this.handleContextAction(action);
      }
    });

    // Handle history context menu actions
    this.historyContextMenu.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) {
        e.stopPropagation();
        this.handleHistoryContextAction(action);
      }
    });

    // Keep terminal focused when clicking toolbar buttons
    document.addEventListener('mousedown', (e) => {
      const isToolbarBtn = e.target.closest('.toolbar-btn') || 
                          e.target.closest('.history-toggle') ||
                          e.target.closest('.add-tab') ||
                          e.target.closest('.close-tab');
      
      if (isToolbarBtn) {
        e.preventDefault(); // Prevent focus loss
        
        // Re-focus terminal after button action
        setTimeout(() => {
          const tab = this.tabs.find(t => t.id === this.activeTab);
          if (tab) {
            tab.term.focus();
          }
        }, 0);
      }
    });
  }

  showContextMenu(x, y, emptyClick = false) {
    // Hide/show package manager options based on whether text is selected
    const packageItems = this.contextMenu.querySelectorAll('[data-action="pacman"], [data-action="yay"], [data-action="apt"], [data-action="dnf"], [data-action="search"]');
    packageItems.forEach(item => {
      item.style.display = emptyClick ? 'none' : 'block';
    });
    
    // Show/hide dividers
    const dividers = this.contextMenu.querySelectorAll('.context-divider');
    dividers.forEach((div, idx) => {
      if (idx === 1 && emptyClick) {
        div.style.display = 'none';
      } else if (idx === 2 && emptyClick) {
        div.style.display = 'none';
      } else {
        div.style.display = 'block';
      }
    });
    
    // Get actual menu dimensions
    this.contextMenu.style.display = 'block';
    this.contextMenu.style.left = '0px';
    this.contextMenu.style.top = '0px';
    
    requestAnimationFrame(() => {
      const menuRect = this.contextMenu.getBoundingClientRect();
      const menuWidth = menuRect.width;
      const menuHeight = menuRect.height;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      let adjustedX = x;
      let adjustedY = y;
      
      if (x + menuWidth > windowWidth) {
        adjustedX = windowWidth - menuWidth - 5;
      }
      
      if (y + menuHeight > windowHeight) {
        adjustedY = windowHeight - menuHeight - 5;
      }
      
      if (adjustedX < 5) {
        adjustedX = 5;
      }
      
      if (adjustedY < 5) {
        adjustedY = 5;
      }
      
      this.contextMenu.style.left = adjustedX + 'px';
      this.contextMenu.style.top = adjustedY + 'px';
    });
    
    // Wait for next frame to get actual dimensions
    requestAnimationFrame(() => {
      const menuRect = this.contextMenu.getBoundingClientRect();
      const menuWidth = menuRect.width;
      const menuHeight = menuRect.height;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Calculate position to keep menu fully visible
      let adjustedX = x;
      let adjustedY = y;
      
      // Check right edge
      if (x + menuWidth > windowWidth) {
        adjustedX = windowWidth - menuWidth - 5;
      }
      
      // Check bottom edge
      if (y + menuHeight > windowHeight) {
        adjustedY = windowHeight - menuHeight - 5;
      }
      
      // Check left edge
      if (adjustedX < 5) {
        adjustedX = 5;
      }
      
      // Check top edge
      if (adjustedY < 5) {
        adjustedY = 5;
      }
      
      this.contextMenu.style.left = adjustedX + 'px';
      this.contextMenu.style.top = adjustedY + 'px';
    });
  }

  hideContextMenu() {
    this.contextMenu.style.display = 'none';
  }

  showHistoryContextMenu(x, y) {
    // Get actual menu dimensions
    this.historyContextMenu.style.display = 'block';
    this.historyContextMenu.style.left = '0px';
    this.historyContextMenu.style.top = '0px';
    
    requestAnimationFrame(() => {
      const menuRect = this.historyContextMenu.getBoundingClientRect();
      const menuWidth = menuRect.width;
      const menuHeight = menuRect.height;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      let adjustedX = x;
      let adjustedY = y;
      
      if (x + menuWidth > windowWidth) {
        adjustedX = windowWidth - menuWidth - 5;
      }
      
      if (y + menuHeight > windowHeight) {
        adjustedY = windowHeight - menuHeight - 5;
      }
      
      if (adjustedX < 5) {
        adjustedX = 5;
      }
      
      if (adjustedY < 5) {
        adjustedY = 5;
      }
      
      this.historyContextMenu.style.left = adjustedX + 'px';
      this.historyContextMenu.style.top = adjustedY + 'px';
    });
  }

  hideHistoryContextMenu() {
    this.historyContextMenu.style.display = 'none';
  }

  handleHistoryContextAction(action) {
    const tab = this.tabs.find(t => t.id === this.activeTab);
    if (!tab || !this.selectedHistoryCommand) return;
    
    switch (action) {
      case 'execute':
        this.executeCommand(this.selectedHistoryCommand);
        break;
      case 'copy-to-input':
        // Write command to terminal without executing
        tab.ptyProcess.write(this.selectedHistoryCommand);
        tab.term.focus();
        break;
      case 'copy':
        if (typeof nw !== 'undefined') {
          nw.Clipboard.get().set(this.selectedHistoryCommand, 'text');
        } else {
          navigator.clipboard.writeText(this.selectedHistoryCommand);
        }
        break;
    }
    
    this.hideHistoryContextMenu();
  }

  handleContextAction(action) {
    const tab = this.tabs.find(t => t.id === this.activeTab);
    if (!tab) return;
    
    switch (action) {
      case 'copy':
        if (typeof nw !== 'undefined') {
          nw.Clipboard.get().set(this.selectedText, 'text');
        } else {
          navigator.clipboard.writeText(this.selectedText);
        }
        break;
      case 'paste':
        if (typeof nw !== 'undefined') {
          const clipText = nw.Clipboard.get().get('text');
          tab.ptyProcess.write(clipText);
        } else {
          navigator.clipboard.readText().then(text => {
            tab.ptyProcess.write(text);
          });
        }
        break;
      case 'open-folder':
        this.openCurrentFolder(tab);
        break;
      case 'pacman':
        this.executeCommand(`sudo pacman -S ${this.selectedText}`);
        break;
      case 'yay':
        this.executeCommand(`yay -S ${this.selectedText}`);
        break;
      case 'apt':
        this.executeCommand(`sudo apt-get install ${this.selectedText}`);
        break;
      case 'dnf':
        this.executeCommand(`sudo dnf install ${this.selectedText}`);
        break;
      case 'search':
        exec(`xdg-open "https://www.google.com/search?q=${encodeURIComponent(this.selectedText)}"`);
        break;
    }
    
    this.hideContextMenu();
  }

  openCurrentFolder(tab) {
    // Get current working directory from tab
    tab.ptyProcess.write('pwd\r');
    
    // Alternative: use xdg-open with current path
    const fs = require('fs');
    
    // Read the cwd from /proc if available (Linux)
    try {
      const procPath = `/proc/${tab.ptyProcess.pid}/cwd`;
      if (fs.existsSync(procPath)) {
        const cwd = fs.readlinkSync(procPath);
        exec(`xdg-open "${cwd}"`);
      } else {
        // Fallback: open home directory
        exec(`xdg-open "${os.homedir()}"`);
      }
    } catch (err) {
      exec(`xdg-open "${os.homedir()}"`);
    }
  }

  detachTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || this.tabs.length === 1) return;
    
    // For NW.js
    if (typeof nw !== 'undefined') {
      const win = nw.Window.open('index.html', {
        width: 1000,
        height: 600,
        title: tab.name
      });
      
      win.on('loaded', () => {
        // New window will create its own terminal
        this.closeTab(tabId);
      });
    } 
    // For Electron
    else if (typeof require !== 'undefined') {
      try {
        const { BrowserWindow } = require('electron').remote || require('@electron/remote');
        const newWin = new BrowserWindow({
          width: 1000,
          height: 600,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
          }
        });
        
        newWin.loadFile('index.html');
        newWin.setMenuBarVisibility(false);
        
        // Close the tab in current window
        setTimeout(() => {
          this.closeTab(tabId);
        }, 500);
      } catch (err) {
        console.error('Detach not supported in this environment');
      }
    }
  }

  applySettings() {
    // Get new settings
    this.settings.fontFamily = document.getElementById('font-family').value;
    this.settings.fontSize = parseInt(document.getElementById('font-size').value);
    this.settings.theme = document.getElementById('theme').value;
    
    // Save to localStorage
    this.saveSettings();
    
    // Apply to all terminals
    const currentTheme = this.themes[this.settings.theme];
    
    this.tabs.forEach(tab => {
      tab.term.options.fontFamily = `"${this.settings.fontFamily}", "Courier New", monospace`;
      tab.term.options.fontSize = this.settings.fontSize;
      tab.term.options.theme = {
        background: currentTheme.background,
        foreground: currentTheme.foreground,
        cursor: currentTheme.cursor,
        cursorAccent: currentTheme.background,
        selection: '#388bfd40',
        black: currentTheme.black,
        red: currentTheme.red,
        green: currentTheme.green,
        yellow: currentTheme.yellow,
        blue: currentTheme.blue,
        magenta: currentTheme.magenta,
        cyan: currentTheme.cyan,
        white: currentTheme.white,
        brightBlack: currentTheme.brightBlack,
        brightRed: currentTheme.brightRed,
        brightGreen: currentTheme.brightGreen,
        brightYellow: currentTheme.brightYellow,
        brightBlue: currentTheme.brightBlue,
        brightMagenta: currentTheme.brightMagenta,
        brightCyan: currentTheme.brightCyan,
        brightWhite: currentTheme.brightWhite
      };
      
      // Refit terminal
      setTimeout(() => {
        tab.fitAddon.fit();
      }, 100);
    });
    
    // Update terminal area background
    this.terminalArea.style.background = currentTheme.background;
    
    // Focus active terminal
    const activeTab = this.tabs.find(t => t.id === this.activeTab);
    if (activeTab) {
      activeTab.term.focus();
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new TerminalApp());
} else {
  new TerminalApp();
}