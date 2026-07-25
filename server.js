require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = path.join(__dirname, 'users.json');
const MOVIES_FILE = path.join(DATA_DIR, 'movies.json');

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(MOVIES_FILE)) fs.writeFileSync(MOVIES_FILE, JSON.stringify([], null, 2));

function readUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
function writeUsers(data) { fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2)); }
function readMovies() { return JSON.parse(fs.readFileSync(MOVIES_FILE, 'utf8')); }
function writeMovies(data) { fs.writeFileSync(MOVIES_FILE, JSON.stringify(data, null, 2)); }

const JWT_SECRET = process.env.JWT_SECRET || 'kurdstream-secret-2026';

// ئەم ئیمەیڵە هەمیشە بەڕێوەبەری سەرەکی دەبێت، هەرکاتێک تۆمار بکرێت
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'yousfserwan79@gmail.com';

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'تۆکن نییە' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ message: 'تۆکنی نادروست' });
  }
}

function requireAdmin(req, res, next) {
  const users = readUsers();
  const user = users.find(u => u.id === req.userId);
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return res.status(403).json({ message: 'دەسەڵاتی ئەدمینت نییە' });
  }
  req.currentUser = user;
  next();
}

function requireSuperAdmin(req, res, next) {
  const users = readUsers();
  const user = users.find(u => u.id === req.userId);
  if (!user || user.role !== 'superadmin') {
    return res.status(403).json({ message: 'تەنها بەڕێوەبەری سەرەکی دەتوانێت ئەمە بکات' });
  }
  req.currentUser = user;
  next();
}

// ============ AUTH ============

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'ئیمەیڵ و پاسۆرد پێویستن' });

    const users = readUsers();
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ message: 'ئەم ئیمەیڵە پێشتر تۆمارکراوە' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = (email === SUPERADMIN_EMAIL) ? 'superadmin' : 'user';

    const newUser = {
      id: Date.now().toString(),
      name: name || 'User',
      email,
      password: hashedPassword,
      role,
      profiles: [
        { id: '1', name: 'Sereki', isKids: false, watchHistory: [], myList: [] }
      ],
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeUsers(users);

    const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: '30d' });
    const { password: _pw, ...safeUser } = newUser;
    res.status(201).json({ message: 'بە سەرکەوتوویی تۆمار بوی!', token, user: safeUser });
  } catch (err) {
    res.status(500).json({ message: 'هەڵەی سێرڤەر', error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ message: 'ئیمەیڵ یان پاسۆرد هەڵەیە' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'ئیمەیڵ یان پاسۆرد هەڵەیە' });

    // ئەگەر ئیمەیڵی سەرەکی بوو بەڵام ڕۆڵی هێشتا superadmin نەبوو، چاکی بکەوە
    if (user.email === SUPERADMIN_EMAIL && user.role !== 'superadmin') {
      user.role = 'superadmin';
      writeUsers(users);
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    const { password: _pw, ...safeUser } = user;
    res.json({ message: 'بەخێر بێیتەوە!', token, user: safeUser });
  } catch (err) {
    res.status(500).json({ message: 'هەڵەی سێرڤەر', error: err.message });
  }
});

app.get('/api/me', auth, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ message: 'نەدۆزرایەوە' });
  const { password: _pw, ...safeUser } = user;
  res.json(safeUser);
});

// ============ MOVIES: PUBLIC (SEARCH + FILTER) ============

app.get('/api/movies', (req, res) => {
  try {
    let movies = readMovies();
    const { search, genre, category, year, minRating, sort, page = 1, limit = 24 } = req.query;

    if (search) {
      const q = search.toLowerCase();
      movies = movies.filter(m => m.title.toLowerCase().includes(q));
    }
    if (genre) movies = movies.filter(m => m.genres && m.genres.includes(genre));
    if (category) movies = movies.filter(m => m.category === category);
    if (year) movies = movies.filter(m => m.releaseYear === Number(year));
    if (minRating) movies = movies.filter(m => m.imdbRating >= Number(minRating));

    if (sort === 'popular') movies.sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0));
    else if (sort === 'rating') movies.sort((a, b) => (b.imdbRating || 0) - (a.imdbRating || 0));
    else if (sort === 'newest') movies.sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0));
    else movies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = movies.length;
    const start = (page - 1) * limit;
    const pageMovies = movies.slice(start, start + Number(limit));

    res.json({ movies: pageMovies, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'هەڵەی سێرڤەر', error: err.message });
  }
});

app.get('/api/movies/:id', (req, res) => {
  try {
    const movies = readMovies();
    const movie = movies.find(m => m.id === req.params.id);
    if (!movie) return res.status(404).json({ message: 'نەدۆزرایەوە' });
    movie.viewsCount = (movie.viewsCount || 0) + 1;
    writeMovies(movies);
    res.json(movie);
  } catch (err) {
    res.status(500).json({ message: 'هەڵەی سێرڤەر', error: err.message });
  }
});

// ============ MOVIES: ADMIN ONLY ============

app.post('/api/movies', auth, requireAdmin, (req, res) => {
  try {
    const movies = readMovies();
    const newMovie = {
      id: Date.now().toString(),
      title: req.body.title,
      description: req.body.description || '',
      posterUrl: req.body.posterUrl || '',
      bannerUrl: req.body.bannerUrl || '',
      category: req.body.category || 'Movie',
      genres: req.body.genres || [],
      releaseYear: req.body.releaseYear || null,
      imdbRating: req.body.imdbRating || 0,
      is18Plus: req.body.is18Plus || false,
      videoSourceUrl: req.body.videoSourceUrl || '',
      viewsCount: 0,
      createdAt: new Date().toISOString()
    };
    movies.push(newMovie);
    writeMovies(movies);
    res.status(201).json(newMovie);
  } catch (err) {
    res.status(500).json({ message: 'هەڵەی سێرڤەر', error: err.message });
  }
});

app.put('/api/movies/:id', auth, requireAdmin, (req, res) => {
  try {
    const movies = readMovies();
    const movie = movies.find(m => m.id === req.params.id);
    if (!movie) return res.status(404).json({ message: 'نەدۆزرایەوە' });
    Object.assign(movie, req.body);
    writeMovies(movies);
    res.json(movie);
  } catch (err) {
    res.status(500).json({ message: 'هەڵەی سێرڤەر', error: err.message });
  }
});

app.delete('/api/movies/:id', auth, requireAdmin, (req, res) => {
  try {
    let movies = readMovies();
    const exists = movies.find(m => m.id === req.params.id);
    if (!exists) return res.status(404).json({ message: 'نەدۆزرایەوە' });
    movies = movies.filter(m => m.id !== req.params.id);
    writeMovies(movies);
    res.json({ message: 'سڕایەوە' });
  } catch (err) {
    res.status(500).json({ message: 'هەڵەی سێرڤەر', error: err.message });
  }
});

// ============ RECOMMENDATIONS ============

app.get('/api/recommendations/:profileId', (req, res) => {
  try {
    const users = readUsers();
    let targetProfile = null;
    for (const u of users) {
      const p = u.profiles.find(p => p.id === req.params.profileId);
      if (p) { targetProfile = p; break; }
    }
    if (!targetProfile) return res.status(404).json({ message: 'پرۆفایل نەدۆزرایەوە' });

    const movies = readMovies();
    const history = targetProfile.watchHistory || [];

    if (history.length === 0) {
      const popular = [...movies].sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0)).slice(0, 20);
      return res.json({ based_on: 'popular', movies: popular });
    }

    const watchedIds = history.map(h => h.movieId);
    const watchedMovies = movies.filter(m => watchedIds.includes(m.id));

    const genreCount = {};
    watchedMovies.forEach(m => {
      (m.genres || []).forEach(g => { genreCount[g] = (genreCount[g] || 0) + 1; });
    });
    const topGenre = Object.keys(genreCount).sort((a, b) => genreCount[b] - genreCount[a])[0];

    const recommended = movies
      .filter(m => !watchedIds.includes(m.id) && m.genres && m.genres.includes(topGenre))
      .sort((a, b) => (b.imdbRating || 0) - (a.imdbRating || 0))
      .slice(0, 20);

    res.json({ based_on: topGenre, movies: recommended });
  } catch (err) {
    res.status(500).json({ message: 'هەڵەی سێرڤەر', error: err.message });
  }
});

app.post('/api/watch/:profileId', (req, res) => {
  try {
    const { movieId, stoppedAtTime } = req.body;
    const users = readUsers();
    let targetProfile = null;
    for (const u of users) {
      const p = u.profiles.find(p => p.id === req.params.profileId);
      if (p) { targetProfile = p; break; }
    }
    if (!targetProfile) return res.status(404).json({ message: 'پرۆفایل نەدۆزرایەوە' });

    const existing = targetProfile.watchHistory.find(h => h.movieId === movieId);
    if (existing) {
      existing.stoppedAtTime = stoppedAtTime;
      existing.lastWatched = new Date().toISOString();
    } else {
      targetProfile.watchHistory.push({ movieId, stoppedAtTime, lastWatched: new Date().toISOString() });
    }
    writeUsers(users);

    const movies = readMovies();
    const movie = movies.find(m => m.id === movieId);
    if (movie) { movie.viewsCount = (movie.viewsCount || 0) + 1; writeMovies(movies); }

    res.json({ message: 'تۆمارکرا' });
  } catch (err) {
    res.status(500).json({ message: 'هەڵەی سێرڤەر', error: err.message });
  }
});

// ============ ADMIN MANAGEMENT (superadmin only) ============

app.get('/api/admin/users', auth, requireSuperAdmin, (req, res) => {
  const users = readUsers().map(({ password, ...u }) => u);
  res.json(users);
});

app.put('/api/admin/users/:id/role', auth, requireSuperAdmin, (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin', 'superadmin'].includes(role)) {
    return res.status(400).json({ message: 'ڕۆڵی نادروست' });
  }
  const users = readUsers();
  const target = users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ message: 'بەکارهێنەر نەدۆزرایەوە' });

  target.role = role;
  writeUsers(users);
  res.json({ message: `${target.email} بوو بە ${role}` });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`KurdStream Server running on port ${PORT}`));
