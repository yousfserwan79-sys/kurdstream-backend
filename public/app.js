const API = window.location.origin;
let token = localStorage.getItem('token') || null;
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let isRegisterMode = false;
let allGenres = ['Action','Drama','Comedy','Romance','Horror'];
const colors = ['#e50914','#3b82f6','#8b5cf6','#10b981','#f59e0b','#ec4899'];

function openOverlay(id){ document.getElementById(id).classList.add('active'); }
function closeOverlay(id){ document.getElementById(id).classList.remove('active'); }

// ------- ڕەنگ -------
function initColorPicker(){
  const box = document.getElementById('colorPicker');
  const saved = localStorage.getItem('accent') || colors[0];
  document.documentElement.style.setProperty('--accent-color', saved);
  box.innerHTML = colors.map(c =>
    `<span class="color-dot ${c===saved?'selected':''}" style="background:${c}" onclick="setColor('${c}')"></span>`
  ).join('');
}
function setColor(c){
  document.documentElement.style.setProperty('--accent-color', c);
  localStorage.setItem('accent', c);
  initColorPicker();
}

// ------- AUTH -------
function updateAuthUI(){
  const authBtn = document.getElementById('authBtn');
  const adminBtn = document.getElementById('adminBtn');
  if(currentUser){
    authBtn.textContent = 'دەرچوون (' + currentUser.name + ')';
    if(currentUser.role === 'admin' || currentUser.role === 'superadmin'){
      adminBtn.classList.remove('hidden');
    }
    document.getElementById('recommendedSection').classList.remove('hidden');
    loadRecommendations();
  } else {
    authBtn.textContent = 'چوونەژوورەوە';
    adminBtn.classList.add('hidden');
    document.getElementById('recommendedSection').classList.add('hidden');
  }
}

document.getElementById('authBtn').onclick = () => {
  if(currentUser){
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    token = null; currentUser = null;
    updateAuthUI();
  } else {
    openOverlay('authOverlay');
  }
};

document.getElementById('authSwitchLink').onclick = () => {
  isRegisterMode = !isRegisterMode;
  document.getElementById('authTitle').textContent = isRegisterMode ? 'تۆماربوون' : 'چوونەژوورەوە';
  document.getElementById('authSubmitBtn').textContent = isRegisterMode ? 'تۆماربوون' : 'چوونەژوورەوە';
  document.getElementById('regName').classList.toggle('hidden', !isRegisterMode);
  document.getElementById('authSwitchText').innerHTML = isRegisterMode
    ? 'ئەکاونتت هەیە؟ <span id="authSwitchLink2">چوونەژوورەوە</span>'
    : 'ئەکاونتت نییە؟ <span id="authSwitchLink2">تۆماربوون</span>';
  document.getElementById('authSwitchLink2').onclick = document.getElementById('authSwitchLink').onclick;
};

document.getElementById('authSubmitBtn').onclick = async () => {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('regName').value.trim();
  if(!email || !password) return alert('ئیمەیڵ و پاسۆرد پێویستە');

  const endpoint = isRegisterMode ? '/api/register' : '/api/login';
  try{
    const res = await fetch(API + endpoint, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email, password, name})
    });
    const data = await res.json();
    if(!res.ok) return alert(data.message);
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    closeOverlay('authOverlay');
    updateAuthUI();
  }catch(e){ alert('هەڵە لە پەیوەندیکردن بە سێرڤەر'); }
};

// ------- MOVIES -------
async function loadMovies(){
  const search = document.getElementById('searchInput').value;
  const category = document.getElementById('categoryFilter').value;
  const genre = document.getElementById('genreFilter').value;
  const sort = document.getElementById('sortFilter').value;

  const params = new URLSearchParams();
  if(search) params.set('search', search);
  if(category) params.set('category', category);
  if(genre) params.set('genre', genre);
  if(sort) params.set('sort', sort);

  const res = await fetch(API + '/api/movies?' + params.toString());
  const data = await res.json();
  renderGrid('moviesGrid', data.movies);
}

function renderGrid(elId, movies){
  const grid = document.getElementById(elId);
  if(!movies || movies.length === 0){
    grid.innerHTML = '<p style="color:var(--text-secondary);padding:10px;">هیچ فیلمێک نەدۆزرایەوە</p>';
    return;
  }
  grid.innerHTML = movies.map(m => `
    <div class="card" onclick="openMovie('${m.id}')">
      <img src="${m.posterUrl || ''}" onerror="this.style.background='#2a2a35'">
      <div class="info">
        <div class="title">${m.title}</div>
        <div class="meta">${m.releaseYear || ''} · <span class="rating">★${m.imdbRating || 0}</span></div>
      </div>
    </div>
  `).join('');
}

async function openMovie(id){
  const res = await fetch(API + '/api/movies/' + id);
  const m = await res.json();
  document.getElementById('movieModalContent').innerHTML = `
    <button class="close-btn" onclick="closeOverlay('movieOverlay')">✕</button>
    <img class="banner" src="${m.bannerUrl || m.posterUrl || ''}">
    <h2>${m.title}</h2>
    <div class="meta">${m.releaseYear || ''} · ${m.category} · ★${m.imdbRating || 0}</div>
    <p class="desc">${m.description || ''}</p>
    ${m.videoSourceUrl ? `<button class="primary" onclick="watchMovie('${m.id}')">▶ سەیرکردن</button>` : ''}
  `;
  openOverlay('movieOverlay');
}

function watchMovie(id){
  if(currentUser){
    fetch(API + '/api/watch/' + currentUser.profiles[0].id, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ movieId: id, stoppedAtTime: 0 })
    });
  }
  alert('لینکی ڤیدیۆ لێرەدا دەکرێتەوە (پێویستە پلەیەری ڤیدیۆ زیاد بکرێت)');
}

async function loadRecommendations(){
  if(!currentUser) return;
  const res = await fetch(API + '/api/recommendations/' + currentUser.profiles[0].id);
  const data = await res.json();
  renderGrid('recommendedGrid', data.movies);
}

// ------- ADMIN -------
document.getElementById('adminBtn').onclick = async () => {
  openOverlay('adminOverlay');
  loadAdminMovies();
  if(currentUser.role === 'superadmin'){
    document.getElementById('superadminSection').classList.remove('hidden');
    loadUsers();
  }
};

document.getElementById('addMovieBtn').onclick = async () => {
  const body = {
    title: document.getElementById('mTitle').value,
    description: document.getElementById('mDesc').value,
    posterUrl: document.getElementById('mPoster').value,
    bannerUrl: document.getElementById('mBanner').value,
    category: document.getElementById('mCategory').value,
    genres: document.getElementById('mGenres').value.split(',').map(g=>g.trim()).filter(Boolean),
    releaseYear: Number(document.getElementById('mYear').value) || null,
    imdbRating: Number(document.getElementById('mRating').value) || 0,
    videoSourceUrl: document.getElementById('mVideo').value
  };
  if(!body.title) return alert('ناونیشان پێویستە');

  const res = await fetch(API + '/api/movies', {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'Authorization': 'Bearer ' + token},
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if(!res.ok) return alert(data.message);
  alert('زیادکرا!');
  ['mTitle','mDesc','mPoster','mBanner','mGenres','mYear','mRating','mVideo'].forEach(id => document.getElementById(id).value = '');
  loadAdminMovies();
  loadMovies();
};

async function loadAdminMovies(){
  const res = await fetch(API + '/api/movies?limit=100');
  const data = await res.json();
  const list = document.getElementById('adminMoviesList');
  list.innerHTML = data.movies.map(m => `
    <div class="admin-row">
      <span>${m.title}</span>
      <span>
        <button onclick="deleteMovie('${m.id}')">سڕینەوە</button>
      </span>
    </div>
  `).join('');
}

async function deleteMovie(id){
  if(!confirm('دڵنیایت لە سڕینەوە؟')) return;
  const res = await fetch(API + '/api/movies/' + id, {
    method: 'DELETE',
    headers: {'Authorization': 'Bearer ' + token}
  });
  const data = await res.json();
  if(!res.ok) return alert(data.message);
  loadAdminMovies();
  loadMovies();
}

async function loadUsers(){
  const res = await fetch(API + '/api/admin/users', {
    headers: {'Authorization': 'Bearer ' + token}
  });
  if(!res.ok) return;
  const users = await res.json();
  const list = document.getElementById('usersList');
  list.innerHTML = users.map(u => `
    <div class="admin-row">
      <span>${u.email} <span class="badge">${u.role}</span></span>
      <span>
        ${u.role !== 'admin' ? `<button onclick="setRole('${u.id}','admin')">کردن بە ئەدمین</button>` : ''}
        ${u.role !== 'user' ? `<button onclick="setRole('${u.id}','user')">لابردنی ئەدمین</button>` : ''}
      </span>
    </div>
  `).join('');
}

async function setRole(userId, role){
  const res = await fetch(API + '/api/admin/users/' + userId + '/role', {
    method: 'PUT',
    headers: {'Content-Type':'application/json', 'Authorization': 'Bearer ' + token},
    body: JSON.stringify({ role })
  });
  const data = await res.json();
  if(!res.ok) return alert(data.message);
  loadUsers();
}

// ------- INIT -------
document.getElementById('settingsBtn').onclick = () => openOverlay('settingsOverlay');
document.getElementById('searchInput').addEventListener('input', debounce(loadMovies, 300));
document.getElementById('categoryFilter').onchange = loadMovies;
document.getElementById('genreFilter').onchange = loadMovies;
document.getElementById('sortFilter').onchange = loadMovies;

function debounce(fn, ms){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

initColorPicker();
updateAuthUI();
loadMovies();
