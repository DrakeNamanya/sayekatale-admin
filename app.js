// ==========================================
// SAYE KATALE Admin Portal - app.js
// Connected to Supabase Backend
// ==========================================

// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://oyqjovcwjqeifqmcjepk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cWpvdmN3anFlaWZxbWNqZXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTQxMzgsImV4cCI6MjA4NDk5MDEzOH0.oIgHUgKQ0sjmzc3yFaZ6SRWF7HoDsKqeph-YWJoWQKs';

let supabase = null;
let currentAdmin = null;
let allUsers = [];
let allProducts = [];
let allOrders = [];
let allComplaints = [];
let allLoans = [];

// --- SUPABASE INIT ---
// Supabase JS SDK is loaded via <script> tag in index.html (CDN + local fallback)
// This function waits for the global to be available with retry logic
function waitForSupabase(maxWaitMs) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    function check() {
      // Check both possible global names - CDN v2 uses window.supabase
      const sb = window.supabase;
      if (sb && typeof sb.createClient === 'function') {
        console.log('Supabase SDK found via window.supabase');
        resolve(sb);
        return;
      }
      
      // Also check if it's nested (some CDN versions)
      if (window.supabase && window.supabase.supabase && typeof window.supabase.supabase.createClient === 'function') {
        console.log('Supabase SDK found via window.supabase.supabase');
        resolve(window.supabase.supabase);
        return;
      }
      
      if (Date.now() - startTime > maxWaitMs) {
        console.error('Supabase SDK not loaded after ' + maxWaitMs + 'ms. window.supabase =', typeof window.supabase);
        reject(new Error('Supabase SDK not available. Check your network connection and try refreshing.'));
        return;
      }
      
      setTimeout(check, 150);
    }
    
    check();
  });
}

function initSupabase(sb) {
  try {
    supabase = sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client initialized successfully');
    return true;
  } catch (err) {
    console.error('Failed to init Supabase client:', err);
    return false;
  }
}

// --- MAIN INIT ---
document.addEventListener('DOMContentLoaded', async () => {
  const errorEl = document.getElementById('login-error');
  console.log('[Init] DOMContentLoaded fired');

  // Clean up URL if credentials leaked into query params (from previous GET form bug)
  if (window.location.search.includes('email=') || window.location.search.includes('password=')) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Attach login form handler immediately (prevents form GET submission no matter what)
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    // Remove any existing action attribute to prevent form submission
    loginForm.removeAttribute('action');
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Init] Form submit event triggered');
      handleLogin();
      return false;
    });
    // Also handle the button click directly as backup
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Init] Login button click triggered');
        handleLogin();
        return false;
      });
    }
    console.log('[Init] Login form handler attached');
  } else {
    console.error('[Init] Login form not found!');
  }

  try {
    // Wait for Supabase SDK loaded by <script> tag (up to 15 seconds)
    console.log('[Init] Waiting for Supabase SDK...');
    const sb = await waitForSupabase(15000);
    console.log('[Init] Supabase SDK loaded successfully');
    
    if (!initSupabase(sb)) {
      errorEl.textContent = 'Failed to initialize connection. Please refresh the page.';
      errorEl.classList.remove('hidden');
      return;
    }

    // Hide any previous error
    errorEl.classList.add('hidden');

    // Check existing session
    console.log('[Init] Checking existing session...');
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      console.log('[Init] Existing session found for:', session.user.email);
      const isAdmin = await checkAdminAccess(session.user.email);
      if (isAdmin) {
        currentAdmin = {
          id: session.user.id,
          email: session.user.email,
          name: 'Administrator'
        };
        await loadAdminProfile();
        showDashboard();
        return;
      }
      console.log('[Init] Session user is not admin, showing login');
    } else {
      console.log('[Init] No existing session, showing login');
    }

    // Show login screen
    showScreen('login-screen');

  } catch (err) {
    console.error('[Init] Error:', err);
    errorEl.textContent = err.message || 'Failed to load. Please check your connection and refresh.';
    errorEl.classList.remove('hidden');
    
    // Even if SDK fails, the login button should show an error instead of submitting
    console.warn('[Init] Supabase SDK not loaded. Login will show appropriate error.');
  }
});

// --- AUTH ---
async function handleLogin() {
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  const loader = document.getElementById('login-loader');
  const btnText = btn.querySelector('.btn-text');

  console.log('[Login] handleLogin() called');

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Validate inputs
  if (!email || !password) {
    errorEl.textContent = 'Please enter both email and password.';
    errorEl.classList.remove('hidden');
    console.log('[Login] Validation failed - empty fields');
    return;
  }

  // Check if Supabase is ready - try to init if not
  if (!supabase) {
    console.log('[Login] Supabase client not ready, attempting late init...');
    try {
      const sb = window.supabase;
      if (sb && typeof sb.createClient === 'function') {
        initSupabase(sb);
        console.log('[Login] Late init succeeded');
      } else if (sb && sb.supabase && typeof sb.supabase.createClient === 'function') {
        initSupabase(sb.supabase);
        console.log('[Login] Late init succeeded (nested)');
      }
    } catch (e) {
      console.error('[Login] Late init error:', e);
    }
    
    if (!supabase) {
      errorEl.textContent = 'System not ready. Please refresh the page and try again.';
      errorEl.classList.remove('hidden');
      console.error('[Login] Supabase still null after late init attempt');
      return;
    }
  }

  // Show loading state
  errorEl.classList.add('hidden');
  btnText.textContent = 'Signing in...';
  loader.classList.remove('hidden');
  btn.disabled = true;

  try {
    console.log('[Login] Attempting sign in for:', email);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      console.error('[Login] Supabase auth error:', error);
      let msg = error.message || 'Invalid credentials';
      if (msg.includes('Invalid login')) msg = 'Invalid email or password. Please try again.';
      if (msg.includes('Email not confirmed')) msg = 'Please verify your email first.';
      throw new Error(msg);
    }

    if (!data || !data.user) {
      throw new Error('Authentication failed. No user data returned.');
    }

    console.log('[Login] Auth successful, user:', data.user.email, '- checking admin access...');

    // Check admin access
    const isAdmin = await checkAdminAccess(data.user.email);
    if (!isAdmin) {
      await supabase.auth.signOut();
      throw new Error('This account does not have admin privileges. Contact your administrator.');
    }

    console.log('[Login] Admin access confirmed. Loading dashboard...');

    currentAdmin = {
      id: data.user.id,
      email: data.user.email,
      name: 'Administrator'
    };

    await loadAdminProfile();

    // Clear form fields for security
    emailInput.value = '';
    passwordInput.value = '';

    showDashboard();

  } catch (err) {
    console.error('[Login] Error:', err);
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    btnText.textContent = 'Sign In';
    loader.classList.add('hidden');
    btn.disabled = false;
  }
}

async function checkAdminAccess(email) {
  // Check known admin email
  if (email.toLowerCase() === 'admin@datacollectorsltd.org') return true;

  // Check admin_users table
  try {
    const { data } = await supabase
      .from('admin_users')
      .select('is_active')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    return data?.is_active === true;
  } catch {
    return email.toLowerCase() === 'admin@datacollectorsltd.org';
  }
}

async function loadAdminProfile() {
  try {
    const { data } = await supabase
      .from('admin_users')
      .select('name, role')
      .eq('email', currentAdmin.email.toLowerCase())
      .maybeSingle();

    if (data) {
      currentAdmin.name = data.name || 'Administrator';
      currentAdmin.role = data.role || 'superadmin';
    } else {
      currentAdmin.name = 'PSA Administrator';
      currentAdmin.role = 'superadmin';
    }
  } catch {
    currentAdmin.name = 'PSA Administrator';
    currentAdmin.role = 'superadmin';
  }

  document.getElementById('admin-name').textContent = currentAdmin.name;
  document.getElementById('admin-role').textContent = formatRole(currentAdmin.role);
  document.getElementById('topbar-admin-name').textContent = currentAdmin.name;
}

async function handleLogout() {
  if (!confirm('Are you sure you want to logout?')) return;
  await supabase.auth.signOut();
  currentAdmin = null;
  showScreen('login-screen');
  document.getElementById('email').value = '';
  document.getElementById('password').value = '';
}

// --- NAVIGATION ---
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showDashboard() {
  showScreen('dashboard-screen');
  navigateTo('overview');
}

function navigateTo(page) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  // Show page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  // Update title
  const titles = {
    overview: 'Dashboard Overview',
    users: 'User Management',
    products: 'Products',
    orders: 'Orders',
    complaints: 'Complaints Management',
    notifications: 'Notifications',
    analytics: 'Analytics & Insights',
    loans: 'Loan Management'
  };
  document.getElementById('page-title').textContent = titles[page] || 'Dashboard';

  // Load data
  switch (page) {
    case 'overview': loadOverview(); break;
    case 'users': loadUsers(); break;
    case 'products': loadProducts(); break;
    case 'orders': loadOrders(); break;
    case 'complaints': loadComplaints(); break;
    case 'notifications': loadNotificationHistory(); break;
    case 'analytics': loadAnalytics(); break;
    case 'loans': loadLoans(); break;
  }

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function togglePassword() {
  const input = document.getElementById('password');
  const icon = document.getElementById('password-toggle-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.textContent = 'visibility';
  } else {
    input.type = 'password';
    icon.textContent = 'visibility_off';
  }
}

// --- DASHBOARD OVERVIEW ---
async function loadOverview() {
  try {
    // Load stats in parallel
    const [usersRes, productsRes, ordersRes, complaintsRes] = await Promise.all([
      supabase.from('profiles').select('id, role', { count: 'exact', head: false }),
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id, status', { count: 'exact', head: false }),
      supabase.from('complaints').select('id, status', { count: 'exact', head: false })
    ]);

    const users = usersRes.data || [];
    document.getElementById('stat-users').textContent = users.length;
    document.getElementById('stat-products').textContent = productsRes.count || 0;

    const orders = ordersRes.data || [];
    document.getElementById('stat-orders').textContent = orders.length;

    const complaints = complaintsRes.data || [];
    const openComplaints = complaints.filter(c => 
      c.status !== 'resolved' && c.status !== 'closed'
    );
    document.getElementById('stat-complaints').textContent = openComplaints.length;

    // Update badges
    const pendingOrders = orders.filter(o => o.status === 'Pending').length;
    setBadge('orders-badge', pendingOrders);
    setBadge('complaints-badge', openComplaints.length);
    setBadge('users-badge', users.length);

    // User role breakdown
    const roleCount = {};
    users.forEach(u => {
      const role = u.role || 'unknown';
      roleCount[role] = (roleCount[role] || 0) + 1;
    });
    renderRoleBars(roleCount, users.length);

    // Recent orders
    await loadRecentOrders();
    
    // Recent complaints
    await loadRecentComplaints();

  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (el) el.textContent = count > 0 ? count : '';
}

function renderRoleBars(roleCount, total) {
  const container = document.getElementById('role-bars');
  const colors = {
    farmer: 'var(--primary)', buyer: 'var(--blue)', supplier: 'var(--orange)',
    sme: 'var(--purple)', shg: 'var(--teal)', unknown: 'var(--mid-gray)'
  };

  let html = '';
  for (const [role, count] of Object.entries(roleCount).sort((a, b) => b[1] - a[1])) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
    const color = colors[role.toLowerCase()] || 'var(--mid-gray)';
    html += `
      <div class="role-bar">
        <span class="role-bar-label">${role}</span>
        <div class="role-bar-track">
          <div class="role-bar-fill" style="width:${Math.max(pct, 5)}%;background:${color}">${pct}%</div>
        </div>
        <span class="role-bar-count">${count}</span>
      </div>`;
  }
  container.innerHTML = html || '<div class="empty-state"><p>No user data available</p></div>';
}

async function loadRecentOrders() {
  const container = document.getElementById('recent-orders-list');
  try {
    const { data } = await supabase
      .from('orders')
      .select('id, buyer_name, total_amount, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons-outlined">receipt_long</span><p>No recent orders</p></div>';
      return;
    }

    container.innerHTML = data.map(o => `
      <div class="activity-item">
        <div class="activity-icon" style="background:${getStatusColor(o.status)}15;color:${getStatusColor(o.status)}">
          <span class="material-icons-outlined">receipt_long</span>
        </div>
        <div class="activity-info">
          <div class="activity-title">${o.buyer_name || 'Buyer'} - ${formatCurrency(o.total_amount)}</div>
          <div class="activity-meta">${getStatusBadge(o.status)} &middot; ${formatDate(o.created_at)}</div>
        </div>
      </div>`).join('');
  } catch {
    container.innerHTML = '<div class="loading-placeholder">Failed to load</div>';
  }
}

async function loadRecentComplaints() {
  const container = document.getElementById('recent-complaints-list');
  try {
    const { data } = await supabase
      .from('complaints')
      .select('id, subject, user_name, status, priority, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons-outlined">check_circle</span><p>No complaints</p></div>';
      return;
    }

    container.innerHTML = data.map(c => `
      <div class="activity-item">
        <div class="activity-icon" style="background:${getPriorityColor(c.priority)}15;color:${getPriorityColor(c.priority)}">
          <span class="material-icons-outlined">report_problem</span>
        </div>
        <div class="activity-info">
          <div class="activity-title">${c.subject}</div>
          <div class="activity-meta">${c.user_name || 'User'} &middot; ${getStatusBadge(c.status)} &middot; ${formatDate(c.created_at)}</div>
        </div>
      </div>`).join('');
  } catch {
    container.innerHTML = '<div class="loading-placeholder">Failed to load</div>';
  }
}

// --- USERS ---
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-placeholder">Loading users...</td></tr>';

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_number, role, district, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allUsers = data || [];
    renderUsers(allUsers);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-placeholder">Error: ${err.message}</td></tr>`;
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-placeholder">No users found</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.full_name || 'N/A'}</strong></td>
      <td>${u.email || 'N/A'}</td>
      <td>${u.phone_number || 'N/A'}</td>
      <td>${getRoleBadge(u.role)}</td>
      <td>${u.district || 'N/A'}</td>
      <td>${formatDate(u.created_at)}</td>
    </tr>`).join('');
}

function filterUsers() {
  const search = document.getElementById('users-search').value.toLowerCase();
  const role = document.getElementById('users-role-filter').value;
  let filtered = allUsers;
  if (role !== 'all') filtered = filtered.filter(u => (u.role || '').toLowerCase().includes(role));
  if (search) filtered = filtered.filter(u =>
    (u.full_name || '').toLowerCase().includes(search) ||
    (u.email || '').toLowerCase().includes(search) ||
    (u.phone_number || '').includes(search)
  );
  renderUsers(filtered);
}

// --- PRODUCTS ---
async function loadProducts() {
  const tbody = document.getElementById('products-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">Loading products...</td></tr>';

  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category, price, stock_quantity, seller_name, is_active, is_psa, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allProducts = data || [];

    // Populate category filter
    const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
    const catFilter = document.getElementById('products-category-filter');
    catFilter.innerHTML = '<option value="all">All Categories</option>' + 
      categories.map(c => `<option value="${c}">${c}</option>`).join('');

    renderProducts(allProducts);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-placeholder">Error: ${err.message}</td></tr>`;
  }
}

function renderProducts(products) {
  const tbody = document.getElementById('products-tbody');
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">No products found</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><strong>${p.name || 'N/A'}</strong>${p.is_psa ? ' <span class="badge badge-teal">PSA</span>' : ''}</td>
      <td>${p.category || 'N/A'}</td>
      <td>${formatCurrency(p.price)}</td>
      <td>${p.stock_quantity ?? 'N/A'}</td>
      <td>${p.seller_name || 'N/A'}</td>
      <td>${p.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Inactive</span>'}</td>
      <td>${formatDate(p.created_at)}</td>
    </tr>`).join('');
}

function filterProducts() {
  const search = document.getElementById('products-search').value.toLowerCase();
  const category = document.getElementById('products-category-filter').value;
  let filtered = allProducts;
  if (category !== 'all') filtered = filtered.filter(p => p.category === category);
  if (search) filtered = filtered.filter(p =>
    (p.name || '').toLowerCase().includes(search) ||
    (p.seller_name || '').toLowerCase().includes(search)
  );
  renderProducts(filtered);
}

// --- ORDERS ---
async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="loading-placeholder">Loading orders...</td></tr>';

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allOrders = data || [];
    renderOrders(allOrders);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-placeholder">Error: ${err.message}</td></tr>`;
  }
}

function renderOrders(orders) {
  const tbody = document.getElementById('orders-tbody');
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-placeholder">No orders found</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const itemCount = o.item_count || 0;
    return `
    <tr>
      <td><code style="font-size:11px">${(o.id || '').substring(0, 8)}...</code></td>
      <td>${o.buyer_name || 'N/A'}</td>
      <td>${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
      <td>${formatCurrency(o.total_amount)}</td>
      <td>${getStatusBadge(o.status)}</td>
      <td>${o.payment_method || 'N/A'}</td>
      <td>${formatDate(o.created_at)}</td>
      <td>
        <button class="btn-action" onclick="viewOrder('${o.id}')">
          <span class="material-icons-outlined">visibility</span>View
        </button>
      </td>
    </tr>`;
  }).join('');
}

function filterOrders() {
  const search = document.getElementById('orders-search').value.toLowerCase();
  const status = document.getElementById('orders-status-filter').value;
  let filtered = allOrders;
  if (status !== 'all') filtered = filtered.filter(o => o.status === status);
  if (search) filtered = filtered.filter(o =>
    (o.buyer_name || '').toLowerCase().includes(search) ||
    (o.id || '').toLowerCase().includes(search)
  );
  renderOrders(filtered);
}

function viewOrder(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;

  const body = document.getElementById('order-detail-body');
  let items = [];
  if (Array.isArray(order.items)) items = order.items;
  else if (typeof order.items === 'string') {
    try { items = JSON.parse(order.items); } catch {}
  }

  body.innerHTML = `
    <div class="detail-row"><span class="detail-label">Order ID</span><span class="detail-value"><code>${order.id}</code></span></div>
    <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${getStatusBadge(order.status)}</span></div>
    <div class="detail-row"><span class="detail-label">Buyer</span><span class="detail-value">${order.buyer_name || 'N/A'}</span></div>
    <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${order.buyer_phone || 'N/A'}</span></div>
    <div class="detail-row"><span class="detail-label">Address</span><span class="detail-value">${order.delivery_address || 'N/A'}</span></div>
    <div class="detail-row"><span class="detail-label">Payment</span><span class="detail-value">${order.payment_method || 'N/A'}</span></div>
    <div class="detail-row"><span class="detail-label">Total</span><span class="detail-value"><strong>${formatCurrency(order.total_amount)}</strong></span></div>
    <div class="detail-row"><span class="detail-label">Items</span><span class="detail-value">${order.item_count || items.length} item(s)</span></div>
    <div class="detail-row"><span class="detail-label">Created</span><span class="detail-value">${formatDateTime(order.created_at)}</span></div>
    ${order.is_psa_order ? '<div class="detail-row"><span class="detail-label">Type</span><span class="detail-value"><span class="badge badge-teal">PSA Order</span></span></div>' : ''}
    ${items.length > 0 ? `
      <h4 style="margin-top:16px;font-size:14px;color:var(--charcoal)">Items</h4>
      ${items.map(item => `
        <div style="background:var(--bg);padding:10px;border-radius:8px;margin-top:8px;">
          <strong>${item.name || item.product_name || 'Item'}</strong><br>
          <span style="font-size:12px;color:var(--mid-gray)">Qty: ${item.quantity || 1} &middot; ${formatCurrency(item.price || item.unit_price)}</span>
        </div>`).join('')}` : ''}
    <div class="modal-actions">
      <select id="order-status-select">
        <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="Confirmed" ${order.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
        <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>Processing</option>
        <option value="In Transit" ${order.status === 'In Transit' ? 'selected' : ''}>In Transit</option>
        <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
        <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
      </select>
      <button class="btn-primary" onclick="updateOrderStatus('${order.id}')">
        <span class="material-icons-outlined">update</span>Update Status
      </button>
    </div>`;

  document.getElementById('order-modal').classList.remove('hidden');
}

async function updateOrderStatus(orderId) {
  const newStatus = document.getElementById('order-status-select').value;
  try {
    await supabase.from('orders').update({
      status: newStatus,
      updated_at: new Date().toISOString()
    }).eq('id', orderId);
    
    showToast('Order status updated!', 'success');
    closeModal('order-modal');
    loadOrders();
  } catch (err) {
    showToast('Failed to update order: ' + err.message, 'error');
  }
}

// --- COMPLAINTS ---
async function loadComplaints() {
  const tbody = document.getElementById('complaints-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">Loading complaints...</td></tr>';

  try {
    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allComplaints = data || [];
    renderComplaints(allComplaints);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-placeholder">Error: ${err.message}</td></tr>`;
  }
}

function renderComplaints(complaints) {
  const tbody = document.getElementById('complaints-tbody');
  if (!complaints.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">No complaints found</td></tr>';
    return;
  }
  tbody.innerHTML = complaints.map(c => `
    <tr>
      <td><strong>${c.subject || 'N/A'}</strong></td>
      <td>${c.user_name || 'N/A'}</td>
      <td>${c.category || 'N/A'}</td>
      <td>${getPriorityBadge(c.priority)}</td>
      <td>${getStatusBadge(c.status)}</td>
      <td>${formatDate(c.created_at)}</td>
      <td>
        <button class="btn-action" onclick="viewComplaint('${c.id}')">
          <span class="material-icons-outlined">visibility</span>View
        </button>
      </td>
    </tr>`).join('');
}

function filterComplaints() {
  const search = document.getElementById('complaints-search').value.toLowerCase();
  const status = document.getElementById('complaints-status-filter').value;
  const priority = document.getElementById('complaints-priority-filter').value;
  let filtered = allComplaints;
  if (status !== 'all') filtered = filtered.filter(c => c.status === status);
  if (priority !== 'all') filtered = filtered.filter(c => c.priority === priority);
  if (search) filtered = filtered.filter(c =>
    (c.subject || '').toLowerCase().includes(search) ||
    (c.user_name || '').toLowerCase().includes(search)
  );
  renderComplaints(filtered);
}

function viewComplaint(complaintId) {
  const c = allComplaints.find(x => x.id === complaintId);
  if (!c) return;

  const responses = Array.isArray(c.responses) ? c.responses : [];

  const body = document.getElementById('complaint-detail-body');
  body.innerHTML = `
    <div class="detail-row"><span class="detail-label">Subject</span><span class="detail-value"><strong>${c.subject || 'N/A'}</strong></span></div>
    <div class="detail-row"><span class="detail-label">User</span><span class="detail-value">${c.user_name || 'N/A'} (${c.user_role || 'N/A'})</span></div>
    <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${c.user_phone || 'N/A'}</span></div>
    <div class="detail-row"><span class="detail-label">Category</span><span class="detail-value">${c.category || 'N/A'}</span></div>
    <div class="detail-row"><span class="detail-label">Priority</span><span class="detail-value">${getPriorityBadge(c.priority)}</span></div>
    <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${getStatusBadge(c.status)}</span></div>
    <div class="detail-row"><span class="detail-label">Description</span><span class="detail-value">${c.description || 'N/A'}</span></div>
    <div class="detail-row"><span class="detail-label">Created</span><span class="detail-value">${formatDateTime(c.created_at)}</span></div>
    
    ${responses.length > 0 ? `
      <h4 style="margin-top:16px;font-size:14px;color:var(--charcoal)">Responses</h4>
      ${responses.map(r => `
        <div class="response-item">
          <h5>${r.admin_name || 'Admin'}</h5>
          <p>${r.message || ''}</p>
          <div class="response-date">${formatDateTime(r.created_at)}</div>
        </div>`).join('')}` : ''}
    
    <div class="modal-actions" style="flex-direction:column;gap:12px">
      <div style="display:flex;gap:8px;align-items:center">
        <select id="complaint-status-select">
          <option value="pending" ${c.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="in_progress" ${c.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
          <option value="responded" ${c.status === 'responded' ? 'selected' : ''}>Responded</option>
          <option value="resolved" ${c.status === 'resolved' ? 'selected' : ''}>Resolved</option>
          <option value="closed" ${c.status === 'closed' ? 'selected' : ''}>Closed</option>
        </select>
        <button class="btn-primary" onclick="updateComplaintStatus('${c.id}')" style="white-space:nowrap">
          Update Status
        </button>
      </div>
      <div style="display:flex;gap:8px">
        <input type="text" id="complaint-response-input" placeholder="Type your response..." style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
        <button class="btn-primary" onclick="addComplaintResponse('${c.id}')" style="white-space:nowrap">
          <span class="material-icons-outlined">send</span>Reply
        </button>
      </div>
    </div>`;

  document.getElementById('complaint-modal').classList.remove('hidden');
}

async function updateComplaintStatus(complaintId) {
  const newStatus = document.getElementById('complaint-status-select').value;
  try {
    const updateData = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'resolved' || newStatus === 'closed') {
      updateData.resolved_at = new Date().toISOString();
    }
    await supabase.from('complaints').update(updateData).eq('id', complaintId);
    showToast('Complaint status updated!', 'success');
    closeModal('complaint-modal');
    loadComplaints();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
}

async function addComplaintResponse(complaintId) {
  const input = document.getElementById('complaint-response-input');
  const message = input.value.trim();
  if (!message) { showToast('Please type a response', 'error'); return; }

  const complaint = allComplaints.find(c => c.id === complaintId);
  if (!complaint) return;

  const responses = Array.isArray(complaint.responses) ? [...complaint.responses] : [];
  responses.push({
    id: Date.now().toString(),
    admin_id: currentAdmin.id,
    admin_name: currentAdmin.name,
    message,
    created_at: new Date().toISOString()
  });

  try {
    await supabase.from('complaints').update({
      responses,
      status: 'responded',
      updated_at: new Date().toISOString()
    }).eq('id', complaintId);

    // Also notify the user
    if (complaint.user_id) {
      await supabase.from('notifications').insert({
        user_id: complaint.user_id,
        title: 'Complaint Updated',
        message: `Your complaint "${complaint.subject}" has received a response from support.`,
        type: 'message',
        is_read: false,
        data: { complaint_id: complaintId, admin_name: currentAdmin.name }
      });
    }

    showToast('Response sent!', 'success');
    closeModal('complaint-modal');
    loadComplaints();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
}

// --- NOTIFICATIONS ---
function onNotifTargetChange() {
  const target = document.getElementById('notif-target').value;
  document.getElementById('notif-role-group').classList.toggle('hidden', target !== 'role');
  document.getElementById('notif-user-group').classList.toggle('hidden', target !== 'single');
}

async function sendNotification(e) {
  e.preventDefault();
  const target = document.getElementById('notif-target').value;
  const type = document.getElementById('notif-type').value;
  const title = document.getElementById('notif-title').value.trim();
  const message = document.getElementById('notif-message').value.trim();

  if (!title || !message) { showToast('Title and message required', 'error'); return; }

  try {
    let userIds = [];

    if (target === 'all') {
      const { data } = await supabase.from('profiles').select('id');
      userIds = (data || []).map(u => u.id);
    } else if (target === 'role') {
      const role = document.getElementById('notif-role').value;
      const { data } = await supabase.from('profiles').select('id').eq('role', role);
      userIds = (data || []).map(u => u.id);
    } else if (target === 'single') {
      const email = document.getElementById('notif-user-email').value.trim();
      const { data } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
      if (data) userIds = [data.id];
      else { showToast('User not found', 'error'); return; }
    }

    if (userIds.length === 0) { showToast('No recipients found', 'error'); return; }

    const notifications = userIds.map(userId => ({
      user_id: userId,
      title, message, type,
      is_read: false,
      data: { admin_id: currentAdmin.id, admin_name: currentAdmin.name, target }
    }));

    await supabase.from('notifications').insert(notifications);

    // Log it
    try {
      await supabase.from('admin_notification_logs').insert({
        admin_id: currentAdmin.id,
        admin_name: currentAdmin.name,
        title, message, type, target,
        recipient_count: userIds.length,
        sent_at: new Date().toISOString()
      });
    } catch {}

    showToast(`Notification sent to ${userIds.length} user(s)!`, 'success');
    document.getElementById('notification-form').reset();
    onNotifTargetChange();
    loadNotificationHistory();

  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
}

async function loadNotificationHistory() {
  const container = document.getElementById('notif-history');
  try {
    const { data } = await supabase
      .from('admin_notification_logs')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(20);

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons-outlined">notifications_none</span><p>No notifications sent yet</p></div>';
      return;
    }

    container.innerHTML = data.map(n => `
      <div class="activity-item">
        <div class="activity-icon" style="background:var(--orange-light);color:var(--orange)">
          <span class="material-icons-outlined">notifications</span>
        </div>
        <div class="activity-info">
          <div class="activity-title">${n.title}</div>
          <div class="activity-meta">
            Sent to ${n.recipient_count} user(s) &middot; ${n.target} &middot; by ${n.admin_name || 'Admin'} &middot; ${formatDateTime(n.sent_at)}
          </div>
        </div>
      </div>`).join('');
  } catch {
    container.innerHTML = '<div class="loading-placeholder">Failed to load history</div>';
  }
}

// --- ANALYTICS ---
async function loadAnalytics() {
  try {
    const [ordersRes, callsRes, productsRes] = await Promise.all([
      supabase.from('orders').select('*'),
      supabase.from('call_analytics').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('products').select('name, category').eq('is_active', true)
    ]);

    const orders = ordersRes.data || [];
    const calls = callsRes.data || [];
    const products = productsRes.data || [];

    // Stats
    document.getElementById('stat-calls').textContent = calls.length;
    
    const delivered = orders.filter(o => o.status === 'Delivered');
    const totalRevenue = delivered.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    document.getElementById('stat-revenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('stat-delivered').textContent = delivered.length;

    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    document.getElementById('stat-categories').textContent = categories.length;

    // Orders by status
    const statusCount = {};
    orders.forEach(o => { statusCount[o.status] = (statusCount[o.status] || 0) + 1; });
    const statusContainer = document.getElementById('orders-by-status');
    let statusHtml = '';
    for (const [status, count] of Object.entries(statusCount).sort((a, b) => b[1] - a[1])) {
      const pct = orders.length > 0 ? ((count / orders.length) * 100).toFixed(0) : 0;
      statusHtml += `
        <div class="role-bar">
          <span class="role-bar-label">${status}</span>
          <div class="role-bar-track">
            <div class="role-bar-fill" style="width:${Math.max(pct, 5)}%;background:${getStatusColor(status)}">${pct}%</div>
          </div>
          <span class="role-bar-count">${count}</span>
        </div>`;
    }
    statusContainer.innerHTML = statusHtml || '<div class="empty-state"><p>No orders data</p></div>';

    // Top products (by frequency in orders)
    const topContainer = document.getElementById('top-products');
    const prodCount = {};
    orders.forEach(o => {
      let items = [];
      if (Array.isArray(o.items)) items = o.items;
      else if (typeof o.items === 'string') { try { items = JSON.parse(o.items); } catch {} }
      items.forEach(item => {
        const name = item.name || item.product_name || 'Unknown';
        prodCount[name] = (prodCount[name] || 0) + (item.quantity || 1);
      });
    });

    const topProducts = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topProducts.length > 0) {
      topContainer.innerHTML = topProducts.map(([name, qty], i) => `
        <div class="activity-item">
          <div class="activity-icon" style="background:var(--primary-light);color:var(--primary)">
            <span style="font-weight:700;font-size:14px">#${i+1}</span>
          </div>
          <div class="activity-info">
            <div class="activity-title">${name}</div>
            <div class="activity-meta">${qty} units ordered</div>
          </div>
        </div>`).join('');
    } else {
      topContainer.innerHTML = '<div class="empty-state"><p>No product data yet</p></div>';
    }

    // Call analytics table
    const callsTbody = document.getElementById('calls-tbody');
    if (calls.length === 0) {
      callsTbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">No call data available</td></tr>';
    } else {
      callsTbody.innerHTML = calls.slice(0, 20).map(c => `
        <tr>
          <td>${c.buyer_name || 'N/A'}</td>
          <td>${c.seller_name || 'N/A'}</td>
          <td>${c.product_name || 'N/A'}</td>
          <td>${c.product_category || 'N/A'}</td>
          <td>${formatCurrency(c.product_price)}</td>
          <td><span class="badge badge-blue">${(c.call_direction || 'N/A').replace(/_/g, ' ')}</span></td>
          <td>${formatDate(c.created_at)}</td>
        </tr>`).join('');
    }

  } catch (err) {
    console.error('Analytics error:', err);
  }
}

// --- HELPERS ---
function formatCurrency(amount) {
  if (!amount && amount !== 0) return 'N/A';
  return Number(amount).toLocaleString('en-UG');
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-UG', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-UG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRole(role) {
  const roles = { superadmin: 'Super Admin', admin: 'Admin', moderator: 'Moderator', analyst: 'Analyst', finance: 'Finance', customerrelations: 'Customer Relations', engineer: 'Engineer' };
  return roles[(role || '').toLowerCase()] || role || 'Admin';
}

function getStatusBadge(status) {
  const s = (status || '').toLowerCase();
  const map = {
    pending: 'badge-orange', confirmed: 'badge-blue', processing: 'badge-blue',
    'in transit': 'badge-purple', 'in_transit': 'badge-purple',
    delivered: 'badge-green', completed: 'badge-green',
    cancelled: 'badge-red', 'awaiting confirmation': 'badge-orange',
    in_progress: 'badge-blue', responded: 'badge-teal',
    resolved: 'badge-green', closed: 'badge-gray'
  };
  return `<span class="badge ${map[s] || 'badge-gray'}">${status || 'N/A'}</span>`;
}

function getStatusColor(status) {
  const s = (status || '').toLowerCase();
  const map = {
    pending: '#F59E0B', confirmed: '#3B82F6', processing: '#3B82F6',
    'in transit': '#8B5CF6', delivered: '#01AC66', completed: '#01AC66',
    cancelled: '#EF4444', resolved: '#01AC66', closed: '#6B7280'
  };
  return map[s] || '#6B7280';
}

function getRoleBadge(role) {
  const r = (role || '').toLowerCase();
  const map = { farmer: 'badge-green', buyer: 'badge-blue', supplier: 'badge-orange', sme: 'badge-purple', shg: 'badge-teal' };
  return `<span class="badge ${map[r] || 'badge-gray'}">${role || 'N/A'}</span>`;
}

function getPriorityBadge(priority) {
  const p = (priority || '').toLowerCase();
  const map = { urgent: 'badge-red', high: 'badge-orange', medium: 'badge-blue', low: 'badge-gray' };
  return `<span class="badge ${map[p] || 'badge-gray'}">${priority || 'N/A'}</span>`;
}

function getPriorityColor(priority) {
  const p = (priority || '').toLowerCase();
  const map = { urgent: '#EF4444', high: '#F59E0B', medium: '#3B82F6', low: '#6B7280' };
  return map[p] || '#6B7280';
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

async function refreshDashboard() {
  const current = document.querySelector('.nav-item.active');
  const page = current ? current.dataset.page : 'overview';
  navigateTo(page);
  showToast('Refreshed!', 'success');
}

// ==========================================
// LOAN MANAGEMENT
// ==========================================

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cWpvdmN3anFlaWZxbWNqZXBrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQxNDEzOCwiZXhwIjoyMDg0OTkwMTM4fQ.HCnYQcNpl6DF_btX28UDbbDgkb9-7oH2O00w0ir1QrY';

let currentLoanFilter = 'pending';

async function loadLoans() {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/loan_applications?order=created_at.desc`, {
      headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` }
    });
    if (resp.status === 404) {
      document.getElementById('loans-tbody').innerHTML =
        '<tr><td colspan="9" style="text-align:center;padding:24px;color:#F59E0B;">loan_applications table not found. Please run the SQL setup in Supabase SQL Editor.</td></tr>';
      return;
    }
    allLoans = await resp.json();

    // Update stats
    const pending = allLoans.filter(l => l.status === 'pending');
    const active = allLoans.filter(l => ['disbursed','repaying','approved'].includes(l.status));
    const rejected = allLoans.filter(l => l.status === 'rejected');
    const totalDisbursed = active.reduce((s, l) => s + (l.approved_amount || 0), 0);

    setText('stat-pending-loans', pending.length);
    setText('stat-active-loans', active.length);
    setText('stat-total-disbursed', totalDisbursed.toLocaleString());
    setText('stat-rejected-loans', rejected.length);

    // Update badge
    const badge = document.getElementById('loans-badge');
    if (badge) badge.textContent = pending.length > 0 ? pending.length : '';

    filterLoans(currentLoanFilter);
  } catch (e) {
    console.error('Failed to load loans:', e);
    document.getElementById('loans-tbody').innerHTML =
      `<tr><td colspan="9" class="loading-placeholder">Error loading loans: ${e.message}</td></tr>`;
  }
}

function filterLoans(tab) {
  currentLoanFilter = tab;
  document.querySelectorAll('.loan-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.loan-tab[data-tab="${tab}"]`);
  if (activeTab) activeTab.classList.add('active');

  let filtered;
  switch (tab) {
    case 'pending': filtered = allLoans.filter(l => l.status === 'pending'); break;
    case 'active': filtered = allLoans.filter(l => ['disbursed','repaying','approved'].includes(l.status)); break;
    case 'completed': filtered = allLoans.filter(l => l.status === 'completed'); break;
    case 'rejected': filtered = allLoans.filter(l => ['rejected','defaulted'].includes(l.status)); break;
    default: filtered = allLoans;
  }

  const tbody = document.getElementById('loans-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:#9CA3AF;">No ${tab} loan applications</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(loan => {
    const score = (loan.credit_score || 0).toFixed(0);
    const band = loan.credit_band || '';
    const bandColor = score >= 80 ? '#4CAF50' : score >= 60 ? '#8BC34A' : score >= 40 ? '#FFC107' : score >= 20 ? '#FF9800' : '#F44336';
    const statusColor = { pending:'#F59E0B', approved:'#4CAF50', disbursed:'#4CAF50', repaying:'#3B82F6', completed:'#0D9488', rejected:'#EF4444', defaulted:'#991B1B' }[loan.status] || '#6B7280';
    const date = loan.created_at ? new Date(loan.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';

    let actions = '';
    if (loan.status === 'pending') {
      actions = `<button class="btn-sm btn-approve" onclick="showLoanApproval('${loan.id}')">Review</button>`;
    } else if (['disbursed','repaying'].includes(loan.status)) {
      actions = `<button class="btn-sm" onclick="showLoanDetail('${loan.id}')">Details</button>`;
    } else {
      actions = `<button class="btn-sm" onclick="showLoanDetail('${loan.id}')">View</button>`;
    }

    return `<tr>
      <td><strong>${loan.user_name || 'Unknown'}</strong></td>
      <td>${loan.user_phone || ''}</td>
      <td>${loan.user_district || ''}${loan.user_subcounty ? ' - ' + loan.user_subcounty : ''}</td>
      <td><span style="color:${bandColor};font-weight:600;">${score}/100</span> <small>(${band})</small></td>
      <td>${(loan.requested_amount || 0).toLocaleString()}</td>
      <td>${(loan.monthly_revenue || 0).toLocaleString()}</td>
      <td><span class="status-badge" style="background:${statusColor}15;color:${statusColor};border:1px solid ${statusColor}30;">${(loan.status || '').toUpperCase()}</span></td>
      <td>${date}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

function showLoanApproval(loanId) {
  const loan = allLoans.find(l => l.id === loanId);
  if (!loan) return;

  const body = document.getElementById('loan-detail-body');
  body.innerHTML = `
    <div style="margin-bottom:16px;">
      <h4 style="margin:0 0 4px;">${loan.user_name || 'Unknown'}</h4>
      <p style="color:#6B7280;font-size:13px;margin:0;">${loan.user_phone || ''} | ${loan.user_district || ''} ${loan.user_subcounty ? '- ' + loan.user_subcounty : ''}</p>
      ${loan.user_agrihub ? `<p style="color:#6B7280;font-size:12px;margin:4px 0 0;">Agrihub: ${loan.user_agrihub}</p>` : ''}
    </div>
    <div style="background:#F5F7FA;border-radius:12px;padding:12px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#6B7280;font-size:12px;">Credit Score</span><strong>${(loan.credit_score || 0).toFixed(0)}/100 (${loan.credit_band || ''})</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#6B7280;font-size:12px;">Monthly Revenue</span><strong>UGX ${(loan.monthly_revenue || 0).toLocaleString()}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#6B7280;font-size:12px;">Total Transactions</span><strong>${loan.total_sales_count || 0}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#6B7280;font-size:12px;">Requested Amount</span><strong>UGX ${(loan.requested_amount || 0).toLocaleString()}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#6B7280;font-size:12px;">Suggested Amount</span><strong>UGX ${(loan.suggested_amount || 0).toLocaleString()}</strong></div>
    </div>
    <div class="form-group"><label>Approved Amount (UGX)</label><input type="number" id="loan-amount" value="${Math.round(loan.requested_amount || 0)}" class="form-input"></div>
    <div style="display:flex;gap:12px;">
      <div class="form-group" style="flex:1;"><label>Interest Rate (%)</label><input type="number" id="loan-rate" value="${loan.interest_rate || 15}" class="form-input"></div>
      <div class="form-group" style="flex:1;"><label>Period (days)</label><input type="number" id="loan-days" value="${loan.repayment_period_days || 90}" class="form-input"></div>
    </div>
    <div class="form-group"><label>Review Notes</label><textarea id="loan-notes" class="form-input" rows="2" placeholder="Optional notes..."></textarea></div>
    <div style="display:flex;gap:12px;margin-top:16px;">
      <button class="btn-sm" style="flex:1;background:#EF4444;color:#fff;padding:10px;border:none;border-radius:8px;cursor:pointer;" onclick="reviewLoan('${loan.id}','rejected')">Reject</button>
      <button class="btn-sm" style="flex:1;background:#01AC66;color:#fff;padding:10px;border:none;border-radius:8px;cursor:pointer;" onclick="reviewLoan('${loan.id}','approved')">Approve & Disburse</button>
    </div>`;

  document.getElementById('loan-modal').classList.remove('hidden');
}

function showLoanDetail(loanId) {
  const loan = allLoans.find(l => l.id === loanId);
  if (!loan) return;

  const totalOwed = (loan.approved_amount || 0) * (1 + (loan.interest_rate || 0) / 100);
  const repaid = loan.total_repaid || 0;
  const remaining = Math.max(0, totalOwed - repaid);
  const dueDate = loan.due_date ? new Date(loan.due_date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : 'N/A';

  const body = document.getElementById('loan-detail-body');
  body.innerHTML = `
    <div style="margin-bottom:16px;"><h4 style="margin:0 0 4px;">${loan.user_name || 'Unknown'}</h4>
    <p style="color:#6B7280;font-size:13px;margin:0;">${loan.user_phone || ''} | ${loan.user_district || ''}</p></div>
    <div style="background:#F5F7FA;border-radius:12px;padding:12px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#6B7280;font-size:12px;">Status</span><strong style="text-transform:uppercase;">${loan.status}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#6B7280;font-size:12px;">Approved Amount</span><strong>UGX ${(loan.approved_amount || 0).toLocaleString()}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#6B7280;font-size:12px;">Interest Rate</span><strong>${loan.interest_rate || 0}%</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#6B7280;font-size:12px;">Total Owed</span><strong>UGX ${Math.round(totalOwed).toLocaleString()}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#6B7280;font-size:12px;">Total Repaid</span><strong style="color:#4CAF50;">UGX ${Math.round(repaid).toLocaleString()}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#6B7280;font-size:12px;">Remaining</span><strong style="color:#EF4444;">UGX ${Math.round(remaining).toLocaleString()}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#6B7280;font-size:12px;">Due Date</span><strong>${dueDate}</strong></div>
      ${loan.review_notes ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #E5E7EB;"><span style="color:#6B7280;font-size:12px;">Notes: </span><span style="font-size:13px;">${loan.review_notes}</span></div>` : ''}
    </div>
    <button class="btn-sm" style="width:100%;background:#6B7280;color:#fff;padding:10px;border:none;border-radius:8px;cursor:pointer;" onclick="closeModal('loan-modal')">Close</button>`;

  document.getElementById('loan-modal').classList.remove('hidden');
}

async function reviewLoan(loanId, status) {
  const amount = parseFloat(document.getElementById('loan-amount').value) || 0;
  const rate = parseFloat(document.getElementById('loan-rate').value) || 15;
  const days = parseInt(document.getElementById('loan-days').value) || 90;
  const notes = document.getElementById('loan-notes').value;

  const data = {
    status: status === 'approved' ? 'disbursed' : 'rejected',
    reviewed_by: currentAdmin?.email || 'admin',
    reviewed_at: new Date().toISOString(),
    review_notes: notes,
    updated_at: new Date().toISOString(),
  };

  if (status === 'approved') {
    data.approved_amount = amount;
    data.interest_rate = rate;
    data.repayment_period_days = days;
    data.disbursed_at = new Date().toISOString();
    data.due_date = new Date(Date.now() + days * 86400000).toISOString();
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/loan_applications?id=eq.${loanId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(data),
    });

    closeModal('loan-modal');
    if (resp.ok) {
      showToast(status === 'approved' ? 'Loan approved and disbursed!' : 'Loan rejected.', status === 'approved' ? 'success' : 'error');
      loadLoans();
    } else {
      showToast('Failed to update loan.', 'error');
    }
  } catch (e) {
    showToast('Network error: ' + e.message, 'error');
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
