import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { ShoppingCart, Package, TrendingUp, Users, Plus, Minus, Check, X, Clock, AlertCircle, BarChart3, Settings, LogOut, Home, ChefHat, User, IndianRupee, Coffee, Flame, Sparkles, ArrowRight, Trash2, Edit3, Eye, EyeOff, DollarSign, Boxes, FileText, Calendar, Award, AlertTriangle, CheckCircle2, Smartphone, Wifi, WifiOff, Lock, Volume2, VolumeX } from 'lucide-react';
import { storage, loadCloudState, mergeStates, syncToCloud, hashPassword, nextOrderToken, authLogin, authSetPassword, authChangeOwnerPassword, authSetStaffPassword, authRegisterStaff, authAdminResetOwner, insertCart, setCartClosed, saveCartProfile, loadCartOrders, mergeOrders, applyInventory, setCartConsumables, pushInventoryBlob, pushMenus } from '../lib/store';
import { adminBtn, brand, colors, editInput, editLabel, fileToBase64, groupByCat, menuFor, menuLabelFor, isSingleItem, itemPieces, TYPE_CHIP } from '../core';
import { printTest } from '../lib/escpos';
import { EditModalShell, SectionHeader } from '../components/shared';

const newId = (p) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

// Downscale a photo to keep the upload under Vercel's request limit.

const menuKeyOf = (section, it) => {
  const n = (it.name || '').toLowerCase().trim();
  return section === 'items' ? `${n}|${it.type || ''}` : n;
};
// ids of every row whose key appears more than once in the list

const duplicateIds = (section, list) => {
  const counts = {};
  list.forEach(it => { const k = menuKeyOf(section, it); counts[k] = (counts[k] || 0) + 1; });
  return new Set(list.filter(it => counts[menuKeyOf(section, it)] > 1).map(it => it.id));
};


function MenuEditor({ state, updateState, cartId, cart }) {
  const menu = menuFor(state, cartId);
  const items = menu.items || [], lassi = menu.lassi || [], addons = menu.addons || [];
  const [edit, setEdit] = useState(null);   // { section, item } — null when closed
  const [busy, setBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [scanMsg, setScanMsg] = useState('');
  const fileRef = React.useRef();

  const dupItems = duplicateIds('items', items), dupLassi = duplicateIds('lassi', lassi), dupAddons = duplicateIds('addons', addons);
  // Existing categories (first-seen order) so new items pick from them instead of
  // free-typing a mismatched string that spawns a stray one-item category.
  const itemCats = [...new Set(items.map(i => (i.cat || '').trim()).filter(Boolean))];
  const label = menuLabelFor(state, cartId);
  // Row subtitle: single-price items read as one price; half/full show both.
  const itemSecondary = (i) => {
    const chip = TYPE_CHIP[i.type]?.label;
    const ph = itemPieces(i, 'half'), pf = itemPieces(i, 'full');
    const price = isSingleItem(i)
      ? `₹${i.full}${pf ? ` · ${pf}pc` : ''}`
      : `₹${i.half}/${i.full}${(ph || pf) ? ` · ${ph}/${pf}pc` : ''}`;
    return chip ? `${chip} · ${price}` : price;
  };

  const setMenu = (next) => {
    const menus = { ...state.menus, [cartId]: next };
    updateState({ menus });
    pushMenus(menus, cartId); // menu edits push immediately — never via the recurring sync
  };
  const dedupe = (section) => {
    const list = menu[section] || [];
    const seen = new Set(), kept = [];
    list.forEach(it => { const k = menuKeyOf(section, it); if (!seen.has(k)) { seen.add(k); kept.push(it); } });
    setMenu({ ...menu, [section]: kept });
  };
  const saveItem = (section, item) => {
    const list = menu[section] || [];
    const exists = item.id && list.some(x => x.id === item.id);
    const nextList = exists ? list.map(x => x.id === item.id ? item : x) : [...list, { ...item, id: item.id || newId(section[0]) }];
    setMenu({ ...menu, [section]: nextList });
    setEdit(null);
  };
  const removeItem = (section, id) => { if (confirm('Remove this item?')) setMenu({ ...menu, [section]: (menu[section] || []).filter(x => x.id !== id) }); };

  const onPhoto = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const many = files.length > 1;
    setAiNote(''); setScanMsg(many ? `Reading ${files.length} menu photos…` : ''); setBusy(true);
    try {
      // Downscale every page and send them together in ONE request, so the AI
      // reads the whole menu at once (categories + section label span all pages).
      const images = await Promise.all(files.map(f => fileToBase64(f)));
      const res = await fetch('/api/extract-menu', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, mediaType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');
      const tag = (arr, p) => (arr || []).map(x => ({ ...x, id: newId(p) }));
      const extracted = {
        items: tag(data.items, 'm'),
        lassi: tag(data.lassi, 'l'),
        addons: tag(data.addons, 'a'),
      };
      const count = extracted.items.length + extracted.lassi.length + extracted.addons.length;
      if (count === 0) { setAiNote(`No menu items detected in ${many ? 'those photos' : 'that photo'}. Try a clearer shot.`); return; }
      // Apply everything the scan inferred — section name/emoji, per-category
      // emoji + local-script labels, and (for carts that haven't been configured)
      // the stock mode + stock types. Never clobber values the admin already set,
      // and never touch momowala's curated setup.
      const labelPatch = {};
      if (cartId !== 'momowala') {
        if (!menu.itemLabel && data.menuLabel) {
          labelPatch.itemLabel = String(data.menuLabel).slice(0, 24);
          labelPatch.itemEmoji = (data.menuEmoji || '🍽️').slice(0, 2);
        }
        if (!menu.stockMode && (data.stockMode === 'momo' || data.stockMode === 'simple')) {
          labelPatch.stockMode = data.stockMode;
        }
        if (data.stockMode === 'momo' && Array.isArray(data.stockTypes) && data.stockTypes.length
            && !(menu.stockTypes && menu.stockTypes.length)) {
          labelPatch.stockTypes = data.stockTypes;
        }
      }
      // Category emoji + local-script name — merge in only categories not already
      // styled, so re-scanning never overwrites the admin's tweaks.
      if (Array.isArray(data.categories) && data.categories.length) {
        const merged = { ...(menu.catStyles || {}) };
        data.categories.forEach(c => {
          if (c && c.name && !merged[c.name]) merged[c.name] = { icon: c.emoji || '', hi: c.hindi || '' };
        });
        labelPatch.catStyles = merged;
      }
      const hasExisting = items.length + lassi.length + addons.length > 0;
      const merge = hasExisting && confirm(`Found ${count} items. OK = add to the current menu (skipping any already present), Cancel = replace it.`);
      if (merge) {
        // only add items whose name (+type for momos) isn't already on the menu — avoids double-scan duplicates
        const addUnique = (section, cur, add) => {
          const have = new Set(cur.map(it => menuKeyOf(section, it)));
          return [...cur, ...add.filter(it => !have.has(menuKeyOf(section, it)))];
        };
        const next = {
          items: addUnique('items', items, extracted.items),
          lassi: addUnique('lassi', lassi, extracted.lassi),
          addons: addUnique('addons', addons, extracted.addons),
        };
        const added = (next.items.length - items.length) + (next.lassi.length - lassi.length) + (next.addons.length - addons.length);
        setMenu({ ...menu, ...labelPatch, ...next });
        setAiNote(`Added ${added} new item${added !== 1 ? 's' : ''}, skipped ${count - added} already on the menu. Review below.`);
      } else {
        setMenu({ ...menu, ...labelPatch, ...extracted });
        setAiNote(`Imported ${count} items — review and edit below, then they're saved automatically.`);
      }
    } catch (err) {
      setAiNote(`Couldn't read the menu: ${err.message}. You can still add items manually.`);
    } finally {
      setBusy(false); setScanMsg('');
    }
  };

  return (
    <div>
      <SectionHeader title="Menu Setup" subtitle={cart?.name} />

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPhoto} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        style={{ width: '100%', background: brand.teal, color: '#fff', padding: 16, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14, cursor: busy ? 'wait' : 'pointer', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>
        {busy ? `📷 ${scanMsg || 'Reading menu…'}` : '📷 Scan menu photo(s) (AI auto-fill)'}
      </button>
      <div style={{ fontSize: 11, color: colors.muted, textAlign: 'center', marginBottom: 12 }}>Multi-page menu? Select all the photos at once — they're read together.</div>
      {aiNote && <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: brand.text, marginBottom: 16 }}>{aiNote}</div>}

      <SectionNameControl emoji={label.emoji} name={label.label} onSave={(emoji, name) => setMenu({ ...menu, itemEmoji: emoji, itemLabel: name })} />

      <MenuSection title={`${label.emoji} ${label.label}`} hint="Prices + optional pieces" grouped
        rows={items.map(i => ({ id: i.id, dup: dupItems.has(i.id), group: (i.cat || 'Other'), primary: `${i.name}${i.star ? ' ⭐' : ''}`, secondary: itemSecondary(i) }))}
        dupCount={dupItems.size} onDedupe={() => dedupe('items')}
        onAdd={() => setEdit({ section: 'items', item: { type: 'veg', cat: '', pcsHalf: 5, pcsFull: 10 } })}
        onEdit={(id) => setEdit({ section: 'items', item: items.find(x => x.id === id) })}
        onRemove={(id) => removeItem('items', id)} catStyles={menu.catStyles || {}} />

      <MenuSection title="🥤 Drinks" hint="Single price"
        rows={lassi.map(i => ({ id: i.id, dup: dupLassi.has(i.id), primary: i.name, secondary: `₹${i.price}` }))}
        dupCount={dupLassi.size} onDedupe={() => dedupe('lassi')}
        onAdd={() => setEdit({ section: 'lassi', item: { price: 0 } })}
        onEdit={(id) => setEdit({ section: 'lassi', item: lassi.find(x => x.id === id) })}
        onRemove={(id) => removeItem('lassi', id)} />

      <MenuSection title="➕ Add-ons" hint="₹0 = free"
        rows={addons.map(i => ({ id: i.id, dup: dupAddons.has(i.id), primary: i.name, secondary: i.price === 0 ? 'Free' : `₹${i.price}` }))}
        dupCount={dupAddons.size} onDedupe={() => dedupe('addons')}
        onAdd={() => setEdit({ section: 'addons', item: { price: 0 } })}
        onEdit={(id) => setEdit({ section: 'addons', item: addons.find(x => x.id === id) })}
        onRemove={(id) => removeItem('addons', id)} />

      {edit?.section === 'items' && <MomoItemModal initial={edit.item} stockTypes={menu.stockTypes || []} categories={itemCats} onSave={(it) => saveItem('items', it)} onClose={() => setEdit(null)} />}
      {edit && edit.section !== 'items' && <SimpleItemModal initial={edit.item} section={edit.section} onSave={(it) => saveItem(edit.section, it)} onClose={() => setEdit(null)} />}
    </div>
  );
}


// Lets the admin name the main food section per cart (e.g. "🍽️ Dosa" instead of
// "🥟 Momos"), so a non-momo cart never shows momo wording to staff or customers.
function SectionNameControl({ emoji, name, onSave }) {
  const [open, setOpen] = useState(false);
  const [e, setE] = useState(emoji);
  const [n, setN] = useState(name);
  useEffect(() => { setE(emoji); setN(name); }, [emoji, name]);
  if (!open) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.muted, marginBottom: 14 }}>
      <span>Main section: <b style={{ color: colors.ink }}>{emoji} {name}</b></span>
      <button onClick={() => setOpen(true)} style={{ ...adminBtn, padding: '4px 10px', fontSize: 11 }}>Rename</button>
    </div>
  );
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <div style={editLabel}>MAIN SECTION NAME</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={e} onChange={ev => setE(ev.target.value.slice(0, 2))} placeholder="🍽️" style={{ ...editInput, width: 56, textAlign: 'center', marginBottom: 0 }} />
        <input value={n} onChange={ev => setN(ev.target.value)} placeholder="Dosa" style={{ ...editInput, flex: 1, marginBottom: 0 }} />
        <button onClick={() => { onSave((e || '🍽️').trim(), (n || 'Menu').trim()); setOpen(false); }} style={{ ...adminBtn, color: brand.navy }}>Save</button>
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>Shown as the food section header on the ordering and customer screens.</div>
    </div>
  );
}

function MenuSection({ title, hint, rows, grouped = false, dupCount = 0, onDedupe, onAdd, onEdit, onRemove, catStyles = {} }) {
  const rowEl = (r) => (
    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: `1px solid ${colors.border}`, background: r.dup ? '#FFF7E0' : '#fff' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          {r.primary}
          {r.dup && <span style={{ fontSize: 10, fontWeight: 800, color: '#8A6D00', background: '#FCEAB0', borderRadius: 6, padding: '2px 6px' }}>DUPLICATE</span>}
        </div>
        <div style={{ fontSize: 12, color: colors.muted }}>{r.secondary}</div>
      </div>
      <button onClick={() => onEdit(r.id)} style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 7, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Edit3 size={14}/></button>
      <button onClick={() => onRemove(r.id)} style={{ background: '#fff', border: `1px solid ${colors.border}`, padding: 7, borderRadius: 8, cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color={colors.red}/></button>
    </div>
  );
  const groups = grouped ? groupByCat(rows.map(r => ({ ...r, cat: r.group }))) : null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div><div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div><div style={{ fontSize: 11, color: colors.muted }}>{hint}</div></div>
        <button onClick={onAdd} style={{ ...adminBtn, color: brand.navy, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={14}/> Add</button>
      </div>
      {dupCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFF7E0', border: `1px solid #E0B100`, borderRadius: 10, padding: '8px 12px', fontSize: 12.5, color: '#8A6D00', fontWeight: 600, marginBottom: 8 }}>
          <AlertTriangle size={15} />
          <span style={{ flex: 1 }}>{dupCount} duplicate row{dupCount > 1 ? 's' : ''} found (highlighted below).</span>
          <button onClick={onDedupe} style={{ background: '#fff', border: `1px solid #E0B100`, color: '#8A6D00', padding: '5px 10px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Remove duplicates</button>
        </div>
      )}
      {grouped && rows.length > 0 ? (
        groups.map(g => (
          <div key={g.cat} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 2px 6px' }}>{catStyles[g.cat]?.icon ? `${catStyles[g.cat].icon} ` : ''}{g.cat}</div>
            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>{g.items.map(rowEl)}</div>
          </div>
        ))
      ) : (
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
        {rows.map(rowEl)}
        {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: colors.muted, fontSize: 13 }}>None yet</div>}
      </div>
      )}
    </div>
  );
}


function MomoItemModal({ initial, stockTypes = [], categories = [], onSave, onClose }) {
  const hasStock = stockTypes.length > 0;
  // A cart with no momo stock types (e.g. a dosa cart) defaults to single-price
  // items served whole; a momo cart keeps the half/full two-portion default.
  const [f, setF] = useState(() => {
    const base = { cat: '', type: hasStock ? (stockTypes[0]?.key || '') : 'veg', pcsHalf: 5, pcsFull: 10, half: '', full: '', name: '', star: false, ...initial };
    // Infer single vs half/full from the item itself when editing; new items follow
    // the cart default (staged/momo carts → half/full, simple carts → single).
    base.single = initial?.id ? isSingleItem(initial) : !hasStock;
    return base;
  });
  const [error, setError] = useState('');
  // Start in "type a new category" mode when there are none yet, or when editing
  // an item whose category isn't among the known ones.
  const [newCat, setNewCat] = useState(categories.length === 0 || (!!(initial?.cat) && !categories.includes(initial.cat)));
  const num = (v) => parseInt(v) || 0;
  const single = !!f.single;
  const submit = () => {
    if (!f.name?.trim()) { setError('Enter an item name.'); return; }
    if (!f.cat?.trim()) { setError('Pick or enter a category (e.g. Dosa, Steamed, Snacks).'); return; }
    if (single) {
      if (!num(f.full)) { setError('Enter a price.'); return; }
      onSave({ ...f, single: true, name: f.name.trim(), cat: f.cat.trim(), half: 0, full: num(f.full), pcsHalf: 0, pcsFull: num(f.pcsFull), stockKey: f.type || null });
      return;
    }
    if (!num(f.half) && !num(f.full)) { setError('Enter at least one price.'); return; }
    onSave({ ...f, single: false, name: f.name.trim(), cat: f.cat.trim(), half: num(f.half), full: num(f.full), pcsHalf: num(f.pcsHalf), pcsFull: num(f.pcsFull), stockKey: f.type || null });
  };
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <EditModalShell title={initial?.id ? 'Edit item' : 'Add item'} onClose={onClose} onSave={submit} error={error}>
      <div style={editLabel}>NAME</div>
      <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Masala Dosa" style={editInput} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={editLabel}>CATEGORY</div>
          {newCat ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input autoFocus value={f.cat} onChange={e => set('cat', e.target.value)} placeholder="e.g. Dosa, Uttapam" style={{ ...editInput, flex: 1 }} />
              {categories.length > 0 && (
                <button type="button" onClick={() => { setNewCat(false); set('cat', ''); }} style={{ border: `1px solid ${colors.border}`, background: '#fff', borderRadius: 8, padding: '0 10px', fontSize: 12, color: colors.muted, cursor: 'pointer' }}>List</button>
              )}
            </div>
          ) : (
            <select value={categories.includes(f.cat) ? f.cat : ''} onChange={e => { if (e.target.value === '__new__') { setNewCat(true); set('cat', ''); } else set('cat', e.target.value); }} style={editInput}>
              <option value="" disabled>Select a category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">＋ New category…</option>
            </select>
          )}
        </div>
        <div style={{ flex: 1 }}><div style={editLabel}>{hasStock ? 'STOCK TYPE' : 'VEG / NON-VEG'}</div>
          {hasStock ? (
            <select value={f.type} onChange={e => set('type', e.target.value)} style={editInput}>
              {stockTypes.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
              <option value="">No stock tracking</option>
            </select>
          ) : (
            <select value={f.type || ''} onChange={e => set('type', e.target.value)} style={editInput}>
              <option value="veg">Veg</option>
              <option value="nonveg">Non-veg</option>
              <option value="egg">Egg</option>
              <option value="paneer">Paneer</option>
              <option value="cheese">Cheese</option>
              <option value="">— none —</option>
            </select>
          )}
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, margin: '2px 0 12px', cursor: 'pointer' }}>
        <input type="checkbox" checked={single} onChange={e => set('single', e.target.checked)} /> Single price (no half / full portions)
      </label>
      {single ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={editLabel}>PRICE ₹</div><input type="number" value={f.full} onChange={e => set('full', e.target.value)} style={editInput} /></div>
          <div style={{ flex: 1 }}><div style={editLabel}>PIECES (optional)</div><input type="number" value={f.pcsFull} onChange={e => set('pcsFull', e.target.value)} placeholder="0" style={editInput} /></div>
        </div>
      ) : (<>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={editLabel}>HALF ₹</div><input type="number" value={f.half} onChange={e => set('half', e.target.value)} style={editInput} /></div>
          <div style={{ flex: 1 }}><div style={editLabel}>HALF PCS</div><input type="number" value={f.pcsHalf} onChange={e => set('pcsHalf', e.target.value)} style={editInput} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={editLabel}>FULL ₹</div><input type="number" value={f.full} onChange={e => set('full', e.target.value)} style={editInput} /></div>
          <div style={{ flex: 1 }}><div style={editLabel}>FULL PCS</div><input type="number" value={f.pcsFull} onChange={e => set('pcsFull', e.target.value)} style={editInput} /></div>
        </div>
      </>)}
      <div style={editLabel}>THEFT AUDIT — SERVED ON</div>
      <select value={f.ware || 'plate'} onChange={e => set('ware', e.target.value)} style={editInput}>
        <option value="plate">6"/7" number plate (by half/full)</option>
        <option value="glass">Glass</option>
        <option value="none">No plate/glass (paper tray, packet)</option>
      </select>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: -6, marginBottom: 12 }}>Sets which ware this item consumes in the plate/glass theft audit.</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.star} onChange={e => set('star', e.target.checked)} /> Mark as bestseller ⭐
      </label>
    </EditModalShell>
  );
}


function SimpleItemModal({ initial, section, onSave, onClose }) {
  const [f, setF] = useState({ name: '', price: 0, ...initial });
  const [error, setError] = useState('');
  const submit = () => {
    if (!f.name?.trim()) { setError('Enter a name.'); return; }
    onSave({ ...f, name: f.name.trim(), price: parseInt(f.price) || 0 });
  };
  return (
    <EditModalShell title={`${initial?.id ? 'Edit' : 'Add'} ${section === 'addons' ? 'add-on' : 'drink'}`} onClose={onClose} onSave={submit} error={error}>
      <div style={editLabel}>NAME</div>
      <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder={section === 'addons' ? 'e.g. Extra Cheese' : 'e.g. Mango Lassi'} style={editInput} />
      <div style={editLabel}>PRICE ₹ {section === 'addons' && '(0 = free)'}</div>
      <input type="number" value={f.price} onChange={e => setF(p => ({ ...p, price: e.target.value }))} style={editInput} />
      {section === 'lassi' && (<>
        <div style={editLabel}>THEFT AUDIT — SERVED IN</div>
        <select value={f.ware || 'glass'} onChange={e => setF(p => ({ ...p, ware: e.target.value }))} style={editInput}>
          <option value="glass">350ml glass</option>
          <option value="none">No glass (bottle / packet, e.g. water)</option>
        </select>
        <div style={{ fontSize: 11, color: colors.muted, marginTop: -6 }}>Only glass-served drinks count in the glass theft audit.</div>
      </>)}
    </EditModalShell>
  );
}

// Owner edits their cart's display + contact details (same fields as onboarding,
// minus login credentials, which stay admin-managed).

function CartProfileModal({ cart, printer = {}, onSave, onClose }) {
  const [f, setF] = useState({
    name: cart?.name || '', emoji: cart?.emoji || '🛒', logo: cart?.logo || '', tagline: cart?.tagline || '',
    cuisine: cart?.cuisine || '', location: cart?.location || '', timing: cart?.timing || '',
    phone: cart?.phone || '', instagram: cart?.instagram || '', accent: cart?.accent || brand.teal,
    upiId: cart?.upiId || '', upiQr: cart?.upiQr || '',
    openTime: cart?.openTime || '', closeTime: cart?.closeTime || '',
    printerEnabled: !!printer.enabled, printerFooter: printer.footer || '',
  });
  const [error, setError] = useState('');
  const logoRef = React.useRef(), qrRef = React.useRef();
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
  const setFile = (k, max) => async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { const b64 = await fileToBase64(file, max, 0.8); setF(p => ({ ...p, [k]: `data:image/jpeg;base64,${b64}` })); }
    catch { setError('Could not read that image.'); }
  };
  const submit = () => {
    if (!f.name.trim()) { setError('Cart name is required.'); return; }
    if (!f.cuisine.trim()) { setError('Add a short food description.'); return; }
    onSave({
      name: f.name.trim(), emoji: f.emoji.trim() || '🛒', logo: f.logo || null, tagline: f.tagline.trim(),
      cuisine: f.cuisine.trim(), location: f.location.trim(), timing: f.timing.trim(),
      phone: f.phone.trim(), instagram: f.instagram.trim(), accent: f.accent,
      upiId: f.upiId.trim(), upiQr: f.upiQr || null,
      openTime: f.openTime || null, closeTime: f.closeTime || null,
      printerEnabled: !!f.printerEnabled, printerFooter: f.printerFooter.trim(),
    });
  };
  return (
    <EditModalShell title="Edit cart details" onClose={onClose} onSave={submit} error={error}>
      {/* Logo / icon */}
      <div style={editLabel}>CART LOGO</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: `2px solid ${f.accent}`, overflow: 'hidden', flexShrink: 0 }}>
          {f.logo ? <img src={f.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : f.emoji}
        </div>
        <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={setFile('logo', 400)} />
        <button onClick={() => logoRef.current?.click()} style={{ ...adminBtn, color: brand.navy }}>{f.logo ? 'Change' : 'Upload'} image</button>
        {f.logo && <button onClick={() => setF(p => ({ ...p, logo: '' }))} style={{ ...adminBtn, color: colors.red }}>Remove</button>}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 86 }}><div style={editLabel}>EMOJI</div><input value={f.emoji} onChange={set('emoji')} placeholder="🛒" style={{ ...editInput, textAlign: 'center', fontSize: 22 }} /></div>
        <div style={{ flex: 1 }}><div style={editLabel}>CART NAME</div><input value={f.name} onChange={set('name')} style={editInput} /></div>
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: -6, marginBottom: 12 }}>Uploaded logo is shown when present; otherwise the emoji is used.</div>

      <div style={editLabel}>TAGLINE (optional)</div>
      <input value={f.tagline} onChange={set('tagline')} placeholder="मोमो वाला" style={editInput} />
      <div style={editLabel}>FOOD DESCRIPTION</div>
      <input value={f.cuisine} onChange={set('cuisine')} placeholder="Steamed, Kurkure & Tandoori momos…" style={editInput} />
      <div style={editLabel}>LOCATION / ADDRESS</div>
      <input value={f.location} onChange={set('location')} placeholder="Area, city" style={editInput} />

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 2 }}><div style={editLabel}>TIMING (display)</div><input value={f.timing} onChange={set('timing')} placeholder="Daily 4 PM – 11 PM" style={editInput} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={editLabel}>OPENS</div><input type="time" value={f.openTime} onChange={set('openTime')} style={editInput} /></div>
        <div style={{ flex: 1 }}><div style={editLabel}>CLOSES</div><input type="time" value={f.closeTime} onChange={set('closeTime')} style={editInput} /></div>
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: -6, marginBottom: 12 }}>Outside these hours customers see the cart as closed and can't order.</div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={editLabel}>CONTACT PHONE</div><input type="tel" value={f.phone} onChange={set('phone')} placeholder="+91 …" style={editInput} /></div>
        <div style={{ flex: 1 }}><div style={editLabel}>INSTAGRAM</div><input value={f.instagram} onChange={set('instagram')} placeholder="@handle" style={editInput} /></div>
      </div>

      <div style={editLabel}>UPI ID (for online payment)</div>
      <input value={f.upiId} onChange={set('upiId')} placeholder="name@bank" style={editInput} />
      <div style={editLabel}>UPI QR CODE (optional)</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {f.upiQr && <img src={f.upiQr} alt="UPI QR" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'contain', background: '#fff', border: `1px solid ${colors.border}` }} />}
        <input ref={qrRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={setFile('upiQr', 600)} />
        <button onClick={() => qrRef.current?.click()} style={{ ...adminBtn, color: brand.navy }}>{f.upiQr ? 'Change' : 'Upload'} QR</button>
        {f.upiQr && <button onClick={() => setF(p => ({ ...p, upiQr: '' }))} style={{ ...adminBtn, color: colors.red }}>Remove</button>}
      </div>

      <div style={editLabel}>BRAND COLOUR</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <input type="color" value={f.accent} onChange={set('accent')} style={{ width: 48, height: 40, border: `1px solid ${colors.border}`, borderRadius: 8, cursor: 'pointer', background: '#fff' }} />
        <span style={{ fontSize: 13, color: colors.muted }}>{f.accent}</span>
      </div>

      <div style={{ borderTop: `1px solid ${brand.border}`, margin: '4px 0 12px', paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: brand.navy, marginBottom: 2 }}>🖨️ Receipt printer</div>
        <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 10 }}>Prints a 58mm bill via the RawBT app on this phone (install it + set your printer as default). Shows a Print button to staff.</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!f.printerEnabled} onChange={e => setF(p => ({ ...p, printerEnabled: e.target.checked }))} style={{ width: 18, height: 18, accentColor: brand.navy }} /> Enable receipt printing
        </label>
        {f.printerEnabled && (<>
          <div style={editLabel}>RECEIPT FOOTER (optional)</div>
          <input value={f.printerFooter} onChange={set('printerFooter')} placeholder="Thank you! Visit again" style={editInput} />
          <button type="button" onClick={() => printTest(cart)} style={{ ...adminBtn, color: brand.navy }}>🖨️ Test print</button>
        </>)}
      </div>
    </EditModalShell>
  );
}

// Small reusable cart icon — uploaded logo if present, else emoji.

export { newId, menuKeyOf, duplicateIds, MenuEditor, MenuSection, MomoItemModal, SimpleItemModal, CartProfileModal };
