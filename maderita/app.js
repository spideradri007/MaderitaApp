/* =========================================================
   MADERAPP v2 — Lógica modular
   Estructura: State · CuttingEngine · CanvasRenderer ·
               Inventory · Ideas · Theme · UI
   Uso estricto de Arrays + métodos modernos (forEach, map,
   filter, reduce). Solo for-loop dentro del algoritmo.
   ========================================================= */

(() => {
    'use strict';

    /* =====================================================
       1. STATE CENTRALIZADO
       ===================================================== */
    const State = {
        board: { w: 2440, h: 1830 },
        kerf: 3,
        pieces: [],          // Array de piezas actuales
        result: null,        // Resultado del último corte
        inventory: [],       // Array de retazos
        counters: { pieza: 0 },

        // Tema
        theme: localStorage.getItem('maderapp_theme') || 'light',

        addPiece(data) {
            this.counters.pieza += 1;
            this.pieces.push({
                id: `P${this.counters.pieza}`,
                w: +data.w,
                h: +data.h,
                qty: +data.qty || 1,
                grain: !!data.grain
            });
        },
        removePiece(id) {
            this.pieces = this.pieces.filter(p => p.id !== id);
        },
        clearPieces() {
            this.pieces = [];
            this.counters.pieza = 0;
        }
    };

    /* =====================================================
       2. UTILIDADES
       ===================================================== */
    const $  = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => [...c.querySelectorAll(s)];
    const uid = () => 'RZ-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    const fmt = n => new Intl.NumberFormat('es-ES').format(Math.round(n));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const Toast = {
        show(msg, type = 'info', duration = 2800) {
            const el = document.createElement('div');
            el.className = `toast toast--${type}`;
            el.appendChild(document.createTextNode(msg));
            $('#toastContainer').appendChild(el);
            setTimeout(() => {
                el.style.animation = 'toastIn 0.25s reverse';
                setTimeout(() => el.remove(), 250);
            }, duration);
        }
    };

    /* =====================================================
       3. MOTOR DE CORTE — MaxRects BSSF
       Solo aquí se usan bucles for (razón matemática).
       ===================================================== */
    const CuttingEngine = {
        solve(board, pieces, kerf = 3) {
            // Expandir cantidades en piezas individuales con map + flatMap
            const jobs = pieces.flatMap((p, idx) =>
                Array.from({ length: p.qty }, (_, i) => ({
                    id: `${p.id}-${i + 1}`,
                    label: p.id,
                    w: p.w,
                    h: p.h,
                    grain: p.grain
                }))
            ).sort((a, b) => (b.w * b.h) - (a.w * a.h));

            let freeRects = [{ x: 0, y: 0, w: board.w, h: board.h }];
            const placed = [];
            const unplaced = [];

            // Bucle for indispensable: algoritmo iterativo de empaquetado
            for (const piece of jobs) {
                const best = this._findBest(piece, freeRects, kerf);
                if (!best) { unplaced.push(piece); continue; }

                const rect = {
                    x: best.x, y: best.y,
                    w: piece.w, h: piece.h,
                    id: piece.id, label: piece.label,
                    rotated: best.rotated, grain: piece.grain
                };
                placed.push(rect);
                this._split(freeRects, rect, kerf);
                this._prune(freeRects);
            }

            const boardArea = board.w * board.h;
            const usedArea = placed.reduce((s, r) => s + r.w * r.h, 0);
            const scraps = freeRects
                .filter(r => r.w >= 50 && r.h >= 50)
                .map(r => ({ ...r, type: 'scrap' }));

            return {
                placed, unplaced, scraps,
                metrics: {
                    boardArea,
                    usedArea,
                    wasteArea: boardArea - usedArea,
                    usedPct: (usedArea / boardArea) * 100,
                    wastePct: ((boardArea - usedArea) / boardArea) * 100
                }
            };
        },

        _findBest(piece, freeRects, kerf) {
            let best = null, bestShort = Infinity, bestLong = Infinity;
            // Bucle for: búsqueda exhaustiva en rectángulos libres
            for (const fr of freeRects) {
                const candidates = [
                    { w: piece.w, h: piece.h, rotated: false },
                    !piece.grain && piece.w !== piece.h
                        ? { w: piece.h, h: piece.w, rotated: true }
                        : null
                ].filter(Boolean);

                candidates.forEach(c => {
                    if (c.w + kerf <= fr.w && c.h + kerf <= fr.h) {
                        const sS = Math.min(fr.w - c.w, fr.h - c.h);
                        const lS = Math.max(fr.w - c.w, fr.h - c.h);
                        if (sS < bestShort || (sS === bestShort && lS < bestLong)) {
                            best = { x: fr.x, y: fr.y, rotated: c.rotated };
                            bestShort = sS; bestLong = lS;
                        }
                    }
                });
            }
            return best;
        },

        _split(freeRects, placed, kerf) {
            const newFree = [];
            freeRects.forEach(fr => {
                const noIntersect =
                    placed.x >= fr.x + fr.w || placed.x + placed.w <= fr.x ||
                    placed.y >= fr.y + fr.h || placed.y + placed.h <= fr.y;
                if (noIntersect) { newFree.push(fr); return; }

                if (placed.x > fr.x)
                    newFree.push({ x: fr.x, y: fr.y, w: placed.x - fr.x - kerf, h: fr.h });
                if (placed.x + placed.w + kerf < fr.x + fr.w)
                    newFree.push({
                        x: placed.x + placed.w + kerf, y: fr.y,
                        w: fr.x + fr.w - (placed.x + placed.w) - kerf, h: fr.h
                    });
                if (placed.y > fr.y)
                    newFree.push({ x: fr.x, y: fr.y, w: fr.w, h: placed.y - fr.y - kerf });
                if (placed.y + placed.h + kerf < fr.y + fr.h)
                    newFree.push({
                        x: fr.x, y: placed.y + placed.h + kerf,
                        w: fr.w, h: fr.y + fr.h - (placed.y + placed.h) - kerf
                    });
            });
            freeRects.length = 0;
            freeRects.push(...newFree);
        },

        _prune(freeRects) {
            for (let i = 0; i < freeRects.length; i++) {
                for (let j = i + 1; j < freeRects.length; j++) {
                    const a = freeRects[i], b = freeRects[j];
                    if (this._contains(a, b)) { freeRects.splice(i, 1); i--; break; }
                    if (this._contains(b, a)) { freeRects.splice(j, 1); j--; }
                }
            }
            // Limpieza final con filter
            const valid = freeRects.filter(r => r.w > 0 && r.h > 0);
            freeRects.length = 0;
            freeRects.push(...valid);
        },

        _contains(o, i) {
            return i.x >= o.x && i.y >= o.y &&
                   i.x + i.w <= o.x + o.w &&
                   i.y + i.h <= o.y + o.h;
        }
    };

    /* =====================================================
       4. CANVAS RENDERER
       ===================================================== */
    const CanvasRenderer = {
        canvas: null, ctx: null,
        state: null, zoom: 1, hoverRect: null,

        init(canvasEl) {
            this.canvas = canvasEl;
            this.ctx = canvasEl.getContext('2d');
            this._bindEvents();
        },

        _bindEvents() {
            this.canvas.addEventListener('mousemove', (e) => {
                if (!this.state) return;
                const rect = this.canvas.getBoundingClientRect();
                const sx = this.canvas.width / rect.width;
                const sy = this.canvas.height / rect.height;
                const x = (e.clientX - rect.left) * sx;
                const y = (e.clientY - rect.top) * sy;
                const { padding: pad, scale } = this.state;
                const mx = (x - pad) / scale;
                const my = (y - pad) / scale;

                const all = [...this.state.placed, ...this.state.scraps];
                const found = all.find(r =>
                    mx >= r.x && mx <= r.x + r.w &&
                    my >= r.y && my <= r.y + r.h
                ) || null;

                if (found !== this.hoverRect) {
                    this.hoverRect = found;
                    this.draw();
                }
            });
            this.canvas.addEventListener('mouseleave', () => {
                if (this.hoverRect) { this.hoverRect = null; this.draw(); }
            });
        },

        render(result, board) {
            this.state = { board, placed: result.placed, scraps: result.scraps, metrics: result.metrics };
            this._resize();
            this.draw();
            $('#canvasEmpty').classList.add('is-hidden');
        },

        clear() {
            this.state = null;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            $('#canvasEmpty').classList.remove('is-hidden');
        },

        _resize() {
            const wrap = $('#canvasWrap');
            const W = wrap.clientWidth;
            const H = Math.max(420, wrap.clientHeight);
            const dpr = window.devicePixelRatio || 1;
            this.canvas.width  = W * dpr;
            this.canvas.height = H * dpr;
            this.canvas.style.width  = W + 'px';
            this.canvas.style.height = H + 'px';
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const pad = 32;
            const availW = W - pad * 2;
            const availH = H - pad * 2;
            const scale = Math.min(availW / this.state.board.w, availH / this.state.board.h) * this.zoom;
            this.state.scale = scale;
            this.state.padding = pad;
            this.state.offsetX = pad + (availW - this.state.board.w * scale) / 2;
            this.state.offsetY = pad + (availH - this.state.board.h * scale) / 2;
        },

        _colors() {
            const cs = getComputedStyle(document.documentElement);
            return {
                bg: cs.getPropertyValue('--bg').trim(),
                card: cs.getPropertyValue('--card').trim(),
                text: cs.getPropertyValue('--text').trim(),
                accent: cs.getPropertyValue('--accent').trim(),
                border: cs.getPropertyValue('--border').trim(),
                success: cs.getPropertyValue('--success').trim(),
                muted: cs.getPropertyValue('--text-muted').trim()
            };
        },

        draw() {
            if (!this.state) return;
            const { ctx, state } = this;
            const W = this.canvas.clientWidth;
            const H = this.canvas.clientHeight;
            const c = this._colors();

            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = c.bg;
            ctx.fillRect(0, 0, W, H);

            const { scale, offsetX: ox, offsetY: oy, board } = state;

            // Sombra sólida del tablero (tablero apilado)
            ctx.fillStyle = c.text;
            ctx.fillRect(ox + 5, oy + 5, board.w * scale, board.h * scale);

            // Tablero
            ctx.fillStyle = c.card;
            ctx.fillRect(ox, oy, board.w * scale, board.h * scale);

            // Retazos (verde)
            state.scraps.forEach(r => this._drawRect(r, 'scrap', r === this.hoverRect, c));
            // Piezas (accent)
            state.placed.forEach(r => this._drawRect(r, 'piece', r === this.hoverRect, c));

            // Borde del tablero
            ctx.strokeStyle = c.text;
            ctx.lineWidth = 2;
            ctx.strokeRect(ox, oy, board.w * scale, board.h * scale);

            // Etiquetas de dimensiones
            ctx.fillStyle = c.muted;
            ctx.font = '600 11px "Space Grotesk", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${board.w} mm`, ox + (board.w * scale) / 2, oy - 10);
            ctx.save();
            ctx.translate(ox - 14, oy + (board.h * scale) / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(`${board.h} mm`, 0, 0);
            ctx.restore();
        },

        _drawRect(r, type, isHover, c) {
            const { ctx, state } = this;
            const x = state.offsetX + r.x * state.scale;
            const y = state.offsetY + r.y * state.scale;
            const w = r.w * state.scale;
            const h = r.h * state.scale;

            // Sombra sólida desplazada
            ctx.fillStyle = c.text;
            ctx.fillRect(x + 2, y + 2, w, h);

            // Relleno
            ctx.fillStyle = type === 'piece'
                ? (isHover ? c.accent : c.accent)
                : (isHover ? c.success : c.success);
            ctx.globalAlpha = type === 'piece' ? (isHover ? 1 : 0.85) : (isHover ? 0.9 : 0.7);
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 1;

            // Veta (líneas) para piezas con grain
            if (type === 'piece' && r.grain) {
                ctx.save();
                ctx.strokeStyle = c.text;
                ctx.globalAlpha = 0.2;
                ctx.lineWidth = 1;
                const step = 6;
                for (let i = step; i < h; i += step) {
                    ctx.beginPath();
                    ctx.moveTo(x, y + i);
                    ctx.lineTo(x + w, y + i);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Borde
            ctx.strokeStyle = c.text;
            ctx.lineWidth = isHover ? 2 : 1.5;
            ctx.strokeRect(x, y, w, h);

            // Etiqueta
            if (w > 40 && h > 24) {
                const label = `${r.w}×${r.h}`;
                const subLabel = r.label ? `(${r.label})` : '';
                const fontSize = Math.max(9, Math.min(13, Math.floor(Math.min(w, h) / 8)));
                ctx.font = `700 ${fontSize}px "Space Grotesk", sans-serif`;
                ctx.fillStyle = c.text;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (subLabel && h > 40) {
                    ctx.fillText(label, x + w / 2, y + h / 2 - fontSize * 0.6);
                    ctx.font = `500 ${fontSize - 1}px "Space Grotesk", sans-serif`;
                    ctx.fillStyle = c.muted;
                    ctx.fillText(subLabel, x + w / 2, y + h / 2 + fontSize * 0.7);
                } else {
                    ctx.fillText(label, x + w / 2, y + h / 2);
                }
            }
        },

        setZoom(z) {
            this.zoom = clamp(z, 0.5, 2);
            if (this.state) { this._resize(); this.draw(); }
        },

        download() {
            if (!this.state) return;
            const link = document.createElement('a');
            link.download = `maderapp-plano-${Date.now()}.png`;
            link.href = this.canvas.toDataURL('image/png');
            link.click();
            Toast.show('Plano descargado', 'success');
        }
    };

    /* =====================================================
       5. INVENTARIO (localStorage)
       ===================================================== */
    const Inventory = {
        KEY: 'maderapp_retazos_v2',

        getAll() {
            try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
            catch { return []; }
        },
        save(list) {
            localStorage.setItem(this.KEY, JSON.stringify(list));
            State.inventory = list;
            this._updateBadge();
        },
        addMany(items) {
            const all = this.getAll();
            const now = new Date().toISOString();
            const newItems = items.map(it => ({
                id: uid(),
                w: it.w, h: it.h,
                area: (it.w * it.h) / 100,
                origin: it.origin || 'Corte',
                date: now
            }));
            this.save([...all, ...newItems]);
        },
        remove(id) {
            this.save(this.getAll().filter(r => r.id !== id));
        },
        clear() { this.save([]); },

        _updateBadge() {
            $('#badgeRetazos').textContent = this.getAll().length;
        },

        renderTable() {
            const list = this.getAll();
            const tbody = $('#inventoryBody');
            const empty = $('#inventoryEmpty');
            tbody.innerHTML = '';

            if (!list.length) { empty.classList.remove('is-hidden'); return; }
            empty.classList.add('is-hidden');

            // Render con map + join
            tbody.innerHTML = list.map(r => `
                <tr>
                    <td class="id-cell">${r.id}</td>
                    <td class="dim-cell">${fmt(r.w)} mm</td>
                    <td class="dim-cell">${fmt(r.h)} mm</td>
                    <td class="area-cell">${fmt(r.area)} cm²</td>
                    <td>${r.origin}</td>
                    <td>${new Date(r.date).toLocaleDateString('es-ES')}</td>
                    <td class="text-right">
                        <button class="row-action" data-id="${r.id}" aria-label="Eliminar ${r.id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    };

    /* =====================================================
       6. IDEAS ENGINE
       ===================================================== */
    const Ideas = {
        fullBoard: [
            { icon: '📺', name: 'Mueble de TV', desc: 'Módulo principal con repisas para pantalla de 55".', dims: '1800×500', tags: ['Sala', '18mm'] },
            { icon: '💻', name: 'Escritorio minimal', desc: 'Tapa de 1400×600 con cajonera lateral.', dims: '1400×600', tags: ['Oficina', 'Moderno'] },
            { icon: '🗄️', name: 'Closet 2 puertas', desc: 'Estructura 1000×2000 con barra colgadora.', dims: '1000×2000', tags: ['Dormitorio'] },
            { icon: '📚', name: 'Biblioteca modular', desc: 'Estantería 1200×2200 con 5 niveles.', dims: '1200×2200', tags: ['Living'] },
            { icon: '🍳', name: 'Alacena cocina', desc: 'Módulo aéreo 800×700 con 2 puertas.', dims: '800×700', tags: ['Cocina'] },
            { icon: '🛏️', name: 'Mesa de noche', desc: 'Diseño compacto 500×400 con cajón.', dims: '500×400', tags: ['Compacto'] }
        ],

        scrapTemplates: [
            { minW: 300, minH: 300, icon: '🪞', name: 'Repisas flotantes', desc: 'Aprovecha retazos medianos para decoración.', tags: ['Decoración'] },
            { minW: 200, minH: 200, icon: '📦', name: 'Cajoneras pequeñas', desc: 'Para escritorio o tocador, 20-30cm.', tags: ['Organización'] },
            { minW: 400, minH: 300, icon: '🖼️', name: 'Esquineros', desc: 'Muebles esquineros para espacios muertos.', tags: ['Sala'] },
            { minW: 500, minH: 400, icon: '👟', name: 'Zapatero compacto', desc: 'Módulo bajo con 3-4 niveles.', tags: ['Entrada'] },
            { minW: 600, minH: 400, icon: '🧰', name: 'Organizador taller', desc: 'Panel con ganchos y repisas.', tags: ['Taller'] },
            { minW: 800, minH: 400, icon: '🛋️', name: 'Banco recibidor', desc: 'Banco con almacenamiento inferior.', tags: ['Entrada'] }
        ],

        renderFullBoard() {
            $('#fullBoardIdeas').innerHTML = this.fullBoard
                .map(p => this._card(p))
                .join('');
        },

        renderScrapIdeas() {
            const scraps = Inventory.getAll();
            const wrap = $('#scrapIdeas');
            const empty = $('#scrapIdeasEmpty');

            if (!scraps.length) {
                wrap.innerHTML = '';
                empty.classList.remove('is-hidden');
                return;
            }
            empty.classList.add('is-hidden');

            // match con filter + map
            const ideas = this.scrapTemplates
                .map(tpl => {
                    const fits = scraps.filter(s =>
                        (s.w >= tpl.minW && s.h >= tpl.minH) ||
                        (s.h >= tpl.minW && s.w >= tpl.minH)
                    );
                    return { ...tpl, fitCount: fits.length };
                })
                .filter(i => i.fitCount > 0);

            if (!ideas.length) {
                wrap.innerHTML = `
                    <div class="idea" style="cursor:default;opacity:0.7">
                        <div class="idea__icon">💡</div>
                        <div class="idea__title">Sin coincidencias aún</div>
                        <div class="idea__desc">Tus retazos son muy pequeños para las ideas sugeridas. Sigue acumulando material útil.</div>
                    </div>`;
                return;
            }

            wrap.innerHTML = ideas.map(i => this._card(i, true)).join('');
        },

        _card(p, showFit = false) {
            const fitTag = showFit
                ? `<span class="idea__tag idea__tag--fit">✓ ${p.fitCount} retazo${p.fitCount > 1 ? 's' : ''}</span>`
                : '';
            const dimTag = p.dims ? `<span class="idea__tag">${p.dims} mm</span>` : '';
            return `
                <button class="idea" type="button">
                    <div class="idea__icon">${p.icon}</div>
                    <div class="idea__title">${p.name}</div>
                    <div class="idea__desc">${p.desc}</div>
                    <div class="idea__meta">
                        ${fitTag}${dimTag}
                        ${(p.tags || []).map(t => `<span class="idea__tag">${t}</span>`).join('')}
                    </div>
                </button>`;
        }
    };

    /* =====================================================
       7. THEME MANAGER
       ===================================================== */
    const Theme = {
        init() {
            document.documentElement.setAttribute('data-theme', State.theme);
            $('#themeToggle').addEventListener('click', () => this.toggle());
        },
        toggle() {
            State.theme = State.theme === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', State.theme);
            localStorage.setItem('maderapp_theme', State.theme);
            // Redibujar canvas con nuevos colores
            if (CanvasRenderer.state) CanvasRenderer.draw();
        }
    };

    /* =====================================================
       8. UI / DOM
       ===================================================== */
    const UI = {
        init() {
            this._bindNav();
            this._bindOptimizer();
            this._bindInventory();
            this._bindCanvas();
            this._bindModal();
            this._initDefaults();

            Inventory._updateBadge();
            Inventory.renderTable();
            Ideas.renderFullBoard();
            Ideas.renderScrapIdeas();
            CanvasRenderer.init($('#cutCanvas'));

            window.addEventListener('resize', () => CanvasRenderer.draw());
        },

        _initDefaults() {
            [
                { w: 600, h: 400, qty: 2 },
                { w: 800, h: 500, qty: 1 },
                { w: 450, h: 300, qty: 3 }
            ].forEach(p => State.addPiece(p));
            this._renderPiezas();
        },

        _bindNav() {
            const titles = {
                optimizer: ['Optimizador de Corte', 'Distribuye piezas con precisión milimétrica'],
                inventory: ['Inventario de Retazos', 'Almacén digital con tu material reutilizable'],
                ideas:     ['Ideas Creativas', 'Proyectos sugeridos según tu material']
            };

            $$('.nav__item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const mod = btn.dataset.module;
                    $$('.nav__item').forEach(b => {
                        b.classList.remove('is-active');
                        b.removeAttribute('aria-current');
                    });
                    btn.classList.add('is-active');
                    btn.setAttribute('aria-current', 'page');
                    $$('[data-module-view]').forEach(v => v.classList.add('is-hidden'));
                    $(`[data-module-view="${mod}"]`).classList.remove('is-hidden');
                    $('#pageTitle').textContent = titles[mod][0];
                    $('#pageSubtitle').textContent = titles[mod][1];

                    if (mod === 'inventory') Inventory.renderTable();
                    if (mod === 'ideas') Ideas.renderScrapIdeas();
                    $('.sidebar').classList.remove('is-open');
                });
            });

            $('#mobileMenuBtn').addEventListener('click', () => {
                $('.sidebar').classList.toggle('is-open');
            });
        },

        /* ---------- Optimizer ---------- */
        _bindOptimizer() {
            $('#btnAddPieza').addEventListener('click', () => {
                State.addPiece({ w: '', h: '', qty: 1 });
                this._renderPiezas();
            });
            $('#btnClear').addEventListener('click', () => {
                State.clearPieces();
                State.addPiece({ w: '', h: '', qty: 1 });
                this._renderPiezas();
                CanvasRenderer.clear();
                this._updateKPIs({ metrics: { usedPct: 0, wastePct: 0 }, placed: [], scraps: [] });
                Toast.show('Formulario limpiado', 'info');
            });
            $('#btnDemo').addEventListener('click', () => {
                State.clearPieces();
                [
                    { w: 600, h: 400, qty: 4 },
                    { w: 800, h: 500, qty: 2, grain: true },
                    { w: 450, h: 300, qty: 6 },
                    { w: 1200, h: 600, qty: 1 }
                ].forEach(p => State.addPiece(p));
                this._renderPiezas();
                Toast.show('Ejemplo cargado', 'info');
            });
            $('#formCorte').addEventListener('submit', (e) => {
                e.preventDefault();
                this._runOptimization();
            });
        },

        _renderPiezas() {
            const list = $('#piezasList');
            list.innerHTML = State.pieces.map(p => `
                <div class="pieza-row" role="listitem" data-id="${p.id}">
                    <input type="number" class="p-largo" min="10" max="5000" placeholder="Largo" value="${p.w || ''}" required aria-label="Largo">
                    <input type="number" class="p-ancho" min="10" max="5000" placeholder="Ancho" value="${p.h || ''}" required aria-label="Ancho">
                    <input type="number" class="p-cant"  min="1" max="99" value="${p.qty || 1}" required aria-label="Cantidad">
                    <input type="checkbox" class="pieza-check p-veta" ${p.grain ? 'checked' : ''} aria-label="Veta" title="Respeta veta">
                    <button type="button" class="pieza-remove" aria-label="Eliminar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            `).join('');

            // Eventos por fila
            $$('.pieza-row', list).forEach(row => {
                const id = row.dataset.id;
                const sync = () => {
                    const piece = State.pieces.find(p => p.id === id);
                    if (!piece) return;
                    piece.w = +row.querySelector('.p-largo').value || 0;
                    piece.h = +row.querySelector('.p-ancho').value || 0;
                    piece.qty = +row.querySelector('.p-cant').value || 1;
                    piece.grain = row.querySelector('.p-veta').checked;
                };
                row.querySelectorAll('input').forEach(i => i.addEventListener('input', sync));
                row.querySelector('.pieza-remove').addEventListener('click', () => {
                    State.removePiece(id);
                    this._renderPiezas();
                });
            });
        },

        _runOptimization() {
            // Sincronizar piezas desde el DOM
            $$('.pieza-row').forEach(row => {
                const id = row.dataset.id;
                const piece = State.pieces.find(p => p.id === id);
                if (!piece) return;
                piece.w = +row.querySelector('.p-largo').value || 0;
                piece.h = +row.querySelector('.p-ancho').value || 0;
                piece.qty = +row.querySelector('.p-cant').value || 1;
                piece.grain = row.querySelector('.p-veta').checked;
            });

            const board = {
                w: +$('#tableroLargo').value,
                h: +$('#tableroAncho').value
            };
            const kerf = +$('#kerf').value;

            if (!board.w || !board.h || board.w < 100 || board.h < 100) {
                Toast.show('Dimensiones del tablero inválidas', 'error');
                return;
            }

            const validPieces = State.pieces.filter(p => p.w >= 10 && p.h >= 10 && p.qty > 0);
            if (!validPieces.length) {
                Toast.show('Completa las dimensiones de las piezas', 'error');
                return;
            }

            const result = CuttingEngine.solve(board, validPieces, kerf);
            State.result = result;

            if (!result.placed.length) {
                Toast.show('Ninguna pieza cabe en el tablero', 'error');
                return;
            }

            CanvasRenderer.render(result, board);
            this._updateKPIs(result);

            if (result.scraps.length) {
                Inventory.addMany(result.scraps.map(s => ({
                    w: s.w, h: s.h, origin: `Corte ${board.w}×${board.h}`
                })));
                Inventory.renderTable();
                Ideas.renderScrapIdeas();
                Toast.show(`${result.placed.length} piezas · ${result.scraps.length} retazos guardados`, 'success');
            } else {
                Toast.show(`${result.placed.length} piezas colocadas`, 'success');
            }

            if (result.unplaced.length) {
                Toast.show(`${result.unplaced.length} pieza(s) no cupieron`, 'error', 4000);
            }
        },

        _updateKPIs(result) {
            const total = result.placed.length + result.unplaced.length;
            $('#kpiPiezas').textContent = total;
            $('#kpiUso').textContent = result.metrics.usedPct.toFixed(1);
            $('#kpiDesp').textContent = result.metrics.wastePct.toFixed(1);
            $('#kpiRetazos').textContent = result.scraps.length;
            $('#kpiUsoBar').style.width = `${result.metrics.usedPct}%`;
        },

        /* ---------- Inventario ---------- */
        _bindInventory() {
            $('#btnClearInventory').addEventListener('click', () => {
                if (!Inventory.getAll().length) {
                    Toast.show('El almacén ya está vacío', 'info');
                    return;
                }
                if (confirm('¿Vaciar todo el inventario?')) {
                    Inventory.clear();
                    Inventory.renderTable();
                    Ideas.renderScrapIdeas();
                    Toast.show('Inventario vaciado', 'success');
                }
            });
            $('#inventoryBody').addEventListener('click', (e) => {
                const btn = e.target.closest('.row-action');
                if (!btn) return;
                Inventory.remove(btn.dataset.id);
                Inventory.renderTable();
                Ideas.renderScrapIdeas();
                Toast.show('Retazo eliminado', 'info');
            });
        },

        /* ---------- Canvas ---------- */
        _bindCanvas() {
            $('#btnZoomIn').addEventListener('click', () => CanvasRenderer.setZoom(CanvasRenderer.zoom + 0.15));
            $('#btnZoomOut').addEventListener('click', () => CanvasRenderer.setZoom(CanvasRenderer.zoom - 0.15));
            $('#btnDownload').addEventListener('click', () => CanvasRenderer.download());
        },

        /* ---------- Modal ---------- */
        _bindModal() {
            const modal = $('#modalNew');
            const open = () => modal.showModal();
            const close = () => modal.close();

            $('#btnNewProject').addEventListener('click', open);
            $$('[data-close]', modal).forEach(el => el.addEventListener('click', close));
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

            const templates = {
                closet: [{ w: 600, h: 2000, qty: 2, grain: true }, { w: 1000, h: 600, qty: 2 }, { w: 900, h: 500, qty: 3 }],
                tv:     [{ w: 1800, h: 500, qty: 1 }, { w: 800, h: 400, qty: 2 }, { w: 1200, h: 300, qty: 2 }],
                desk:   [{ w: 1400, h: 600, qty: 1 }, { w: 500, h: 400, qty: 3 }, { w: 400, h: 100, qty: 4 }]
            };

            $$('.template', modal).forEach(card => {
                card.addEventListener('click', () => {
                    State.clearPieces();
                    (templates[card.dataset.tpl] || []).forEach(p => State.addPiece(p));
                    this._renderPiezas();
                    close();
                    Toast.show(`Plantilla aplicada`, 'success');
                });
            });

            $('#btnConfirmNew').addEventListener('click', () => {
                State.clearPieces();
                State.addPiece({ w: '', h: '', qty: 1 });
                this._renderPiezas();
                close();
            });
        }
    };

    /* =====================================================
       9. BOOT
       ===================================================== */
    document.addEventListener('DOMContentLoaded', () => {
        Theme.init();
        UI.init();
    });
})();