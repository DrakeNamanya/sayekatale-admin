// ==========================================
// SAYE KATALE Admin Portal - app.js
// Connected to Supabase Backend
// ==========================================

// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://oyqjovcwjqeifqmcjepk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cWpvdmN3anFlaWZxbWNqZXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTQxMzgsImV4cCI6MjA4NDk5MDEzOH0.oIgHUgKQ0sjmzc3yFaZ6SRWF7HoDsKqeph-YWJoWQKs';

// IMPORTANT: Use 'sbClient' to avoid name clash with window.supabase (the SDK object)
let sbClient = null;
let currentAdmin = null;
let allUsers = [];
let allProducts = [];
let allOrders = [];
let allComplaints = [];
let allLoans = [];

// --- SUPABASE INIT ---
// Robust SDK detection that handles all Supabase JS v2 UMD export patterns
function getSupabaseSDK() {
  // The SDK (supabase.min.js) exports to window.supabase via UMD pattern
  // We check window.supabase directly (our client variable is named sbClient)
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    return window.supabase;
  }
  // Nested pattern (some CDN builds)
  if (window.supabase && window.supabase.supabase && typeof window.supabase.supabase.createClient === 'function') {
    return window.supabase.supabase;
  }
  return null;
}

function initSupabaseClient() {
  var sdk = getSupabaseSDK();
  if (!sdk) {
    console.error('[Init] No Supabase SDK found. window.supabase type:', typeof window.supabase);
    return false;
  }
  try {
    sbClient = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Init] Supabase client created successfully');
    return true;
  } catch (err) {
    console.error('[Init] createClient failed:', err);
    return false;
  }
}

// --- MAIN INIT ---
// Use both DOMContentLoaded AND a fallback setTimeout to guarantee execution
var _initRan = false;
function mainInit() {
  if (_initRan) return;
  _initRan = true;
  
  var errorEl = document.getElementById('login-error');
  console.log('[Init] mainInit() running');

  // Clean up URL if credentials leaked into query params
  if (window.location.search.indexOf('email=') >= 0 || window.location.search.indexOf('password=') >= 0) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Step 1: Attach login handlers SYNCHRONOUSLY (no async, cannot fail)
  try {
    var loginForm = document.getElementById('login-form');
    var loginBtn = document.getElementById('login-btn');
    
    if (loginForm) {
      loginForm.removeAttribute('action');
      loginForm.onsubmit = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        handleLogin();
        return false;
      };
    }
    if (loginBtn) {
      loginBtn.onclick = function(e) {
        if (e && e.preventDefault) e.preventDefault();
        handleLogin();
        return false;
      };
    }
    console.log('[Init] Login handlers attached via direct assignment');
  } catch(e) {
    console.error('[Init] Failed to attach handlers:', e);
  }

  // Step 2: Initialize Supabase client
  if (!initSupabaseClient()) {
    // SDK might still be loading, retry after a delay
    console.log('[Init] SDK not ready yet, will retry in 2s...');
    setTimeout(function() {
      if (!sbClient) {
        initSupabaseClient();
        if (!sbClient) {
          console.error('[Init] SDK still not available after retry');
          if (errorEl) {
            errorEl.textContent = 'Connection system loading... Click Sign In when ready.';
            errorEl.classList.remove('hidden');
          }
        }
      }
    }, 2000);
  }

  // Step 3: Check for existing session (async, but errors won't block login)
  if (sbClient) {
    checkExistingSession();
  } else {
    // When SDK loads later, check session then
    setTimeout(function() {
      if (sbClient) checkExistingSession();
    }, 3000);
  }
}

async function checkExistingSession() {
  try {
    var result = await sbClient.auth.getSession();
    var session = result && result.data && result.data.session;
    if (session) {
      console.log('[Init] Existing session for:', session.user.email);
      var isAdmin = await checkAdminAccess(session.user.email);
      if (isAdmin) {
        currentAdmin = { id: session.user.id, email: session.user.email, name: 'Administrator' };
        await loadAdminProfile();
        showDashboard();
        return;
      }
    }
    console.log('[Init] No valid admin session, showing login');
    showScreen('login-screen');
  } catch(err) {
    console.error('[Init] Session check error:', err);
    showScreen('login-screen');
  }
}

// Fire on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mainInit);
} else {
  // DOM already loaded (e.g., script at bottom of body)
  mainInit();
}
// Absolute fallback - if DOMContentLoaded never fires (some edge cases)
setTimeout(function() { if (!_initRan) mainInit(); }, 5000);

// --- AUTH ---
async function handleLogin() {
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');
  var errorEl = document.getElementById('login-error');
  var btn = document.getElementById('login-btn');
  var loader = document.getElementById('login-loader');
  var btnText = btn ? btn.querySelector('.btn-text') : null;

  console.log('[Login] handleLogin() called');

  // Safety check
  if (!emailInput || !passwordInput) {
    alert('Login form elements not found. Please refresh the page.');
    return;
  }

  var email = emailInput.value.trim();
  var password = passwordInput.value;

  // Validate inputs
  if (!email || !password) {
    if (errorEl) {
      errorEl.textContent = 'Please enter both email and password.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  // Try to init Supabase if not ready (last chance)
  if (!sbClient) {
    console.log('[Login] Supabase not ready, attempting init...');
    initSupabaseClient();
  }
  
  if (!sbClient) {
    if (errorEl) {
      errorEl.textContent = 'Connection not ready. Please wait a moment and try again.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  // Show loading state
  if (errorEl) errorEl.classList.add('hidden');
  if (btnText) btnText.textContent = 'Signing in...';
  if (loader) loader.classList.remove('hidden');
  if (btn) btn.disabled = true;

  try {
    console.log('[Login] Attempting sign in for:', email);

    var result = await sbClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    var data = result.data;
    var error = result.error;

    if (error) {
      console.error('[Login] Auth error:', error);
      var msg = error.message || 'Invalid credentials';
      if (msg.indexOf('Invalid login') >= 0) msg = 'Invalid email or password. Please try again.';
      if (msg.indexOf('Email not confirmed') >= 0) msg = 'Please verify your email first.';
      throw new Error(msg);
    }

    if (!data || !data.user) {
      throw new Error('Authentication failed. No user data returned.');
    }

    console.log('[Login] Auth OK for:', data.user.email);

    // Check admin access
    var isAdmin = await checkAdminAccess(data.user.email);
    if (!isAdmin) {
      await sbClient.auth.signOut();
      throw new Error('This account does not have admin privileges.');
    }

    console.log('[Login] Admin access confirmed!');

    currentAdmin = {
      id: data.user.id,
      email: data.user.email,
      name: 'Administrator'
    };

    await loadAdminProfile();

    // Clear form
    emailInput.value = '';
    passwordInput.value = '';

    showDashboard();

  } catch (err) {
    console.error('[Login] Error:', err);
    if (errorEl) {
      errorEl.textContent = err.message || 'Login failed. Please try again.';
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (btnText) btnText.textContent = 'Sign In';
    if (loader) loader.classList.add('hidden');
    if (btn) btn.disabled = false;
  }
}

async function checkAdminAccess(email) {
  // Check known admin email
  if (email.toLowerCase() === 'admin@datacollectorsltd.org') return true;

  // Check admin_users table
  try {
    const { data } = await sbClient
      .from('admin_users')
      .select('is_active')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    return data?.is_active === true;
  } catch(e) {
    return email.toLowerCase() === 'admin@datacollectorsltd.org';
  }
}

async function loadAdminProfile() {
  try {
    var result = await sbClient
      .from('admin_users')
      .select('name, role')
      .eq('email', currentAdmin.email.toLowerCase())
      .maybeSingle();
    var data = result.data;

    if (data) {
      currentAdmin.name = data.name || 'Administrator';
      currentAdmin.role = data.role || 'superadmin';
    } else {
      currentAdmin.name = 'PSA Administrator';
      currentAdmin.role = 'superadmin';
    }
  } catch(e) {
    currentAdmin.name = 'PSA Administrator';
    currentAdmin.role = 'superadmin';
  }

  document.getElementById('admin-name').textContent = currentAdmin.name;
  document.getElementById('admin-role').textContent = formatRole(currentAdmin.role);
  document.getElementById('topbar-admin-name').textContent = currentAdmin.name;
}

async function handleLogout() {
  if (!confirm('Are you sure you want to logout?')) return;
  await sbClient.auth.signOut();
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
    team: 'Team Management',
    psa: 'PSA Dashboard',
    agrihub: 'AgriHub Dashboard',
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
    case 'team': loadTeamManagement(); break;
    case 'psa': loadPsaDashboard(); break;
    case 'agrihub': loadAgrihubDashboard(); break;
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
      sbClient.from('profiles').select('id, role', { count: 'exact', head: false }),
      sbClient.from('products').select('id', { count: 'exact', head: true }),
      sbClient.from('orders').select('id, status', { count: 'exact', head: false }),
      sbClient.from('complaints').select('id, status', { count: 'exact', head: false })
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
    const { data } = await sbClient
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
    const { data } = await sbClient
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
    const { data, error } = await sbClient
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
    const { data, error } = await sbClient
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
    const { data, error } = await sbClient
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
    await sbClient.from('orders').update({
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
    const { data, error } = await sbClient
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
    await sbClient.from('complaints').update(updateData).eq('id', complaintId);
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
    await sbClient.from('complaints').update({
      responses,
      status: 'responded',
      updated_at: new Date().toISOString()
    }).eq('id', complaintId);

    // Also notify the user
    if (complaint.user_id) {
      await sbClient.from('notifications').insert({
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
      const { data } = await sbClient.from('profiles').select('id');
      userIds = (data || []).map(u => u.id);
    } else if (target === 'role') {
      const role = document.getElementById('notif-role').value;
      const { data } = await sbClient.from('profiles').select('id').eq('role', role);
      userIds = (data || []).map(u => u.id);
    } else if (target === 'single') {
      const email = document.getElementById('notif-user-email').value.trim();
      const { data } = await sbClient.from('profiles').select('id').eq('email', email).maybeSingle();
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

    await sbClient.from('notifications').insert(notifications);

    // Log it
    try {
      await sbClient.from('admin_notification_logs').insert({
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
    const { data } = await sbClient
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
      sbClient.from('orders').select('*'),
      sbClient.from('call_analytics').select('*').order('created_at', { ascending: false }).limit(50),
      sbClient.from('products').select('name, category').eq('is_active', true)
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

// ═══════════════════════════════════════════════════
//  TEAM MANAGEMENT
// ═══════════════════════════════════════════════════
let allTeamMembers = [];

async function loadTeamManagement() {
  try {
    const { data, error } = await sbClient.from('admin_users').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    allTeamMembers = data || [];
    renderTeamStats();
    renderTeamTable();
    renderRolesGrid();
  } catch (e) {
    console.error('[Team] Load error:', e);
    document.getElementById('team-tbody').innerHTML = '<tr><td colspan="7" class="loading-placeholder">Failed to load team data</td></tr>';
  }
}

function renderTeamStats() {
  const active = allTeamMembers.filter(m => m.is_active === true);
  const inactive = allTeamMembers.filter(m => m.is_active !== true);
  const roles = new Set(active.map(m => m.role || 'admin'));
  const agrihubMgrs = active.filter(m => (m.role || '').toLowerCase() === 'agrihub_manager');
  setText('stat-team-active', active.length);
  setText('stat-team-roles', roles.size);
  setText('stat-team-inactive', inactive.length);
  setText('stat-team-agrihub', agrihubMgrs.length);
}

function renderTeamTable() {
  const tbody = document.getElementById('team-tbody');
  if (!allTeamMembers.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">No team members found</td></tr>';
    return;
  }
  tbody.innerHTML = allTeamMembers.map(m => {
    const perms = m.permissions || [];
    const permText = perms.length ? perms.slice(0, 3).join(', ') + (perms.length > 3 ? '...' : '') : 'None';
    const agrihub = m.agrihub_name || m.agrihub || '-';
    const statusClass = m.is_active ? 'status-active' : 'status-inactive';
    const statusText = m.is_active ? 'Active' : 'Inactive';
    return `<tr>
      <td><strong>${m.name || '-'}</strong></td>
      <td>${m.email || '-'}</td>
      <td><span class="status-badge">${formatRole(m.role)}</span></td>
      <td style="font-size:12px;">${permText}</td>
      <td>${agrihub}</td>
      <td><span class="status-badge-sm ${statusClass}">${statusText}</span></td>
      <td>
        <button class="btn-sm" onclick="editTeamMember('${m.id}')">Edit</button>
        ${m.is_active ? `<button class="btn-sm" style="color:var(--red);" onclick="deactivateTeamMember('${m.id}','${(m.name||'').replace(/'/g,"\\'")}')">Deactivate</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function renderRolesGrid() {
  const roles = [
    { key: 'superadmin', name: 'Super Admin', desc: 'Full access to all features including team management', color: '#EF4444', icon: 'admin_panel_settings', perms: 'All permissions' },
    { key: 'admin', name: 'Admin', desc: 'General admin access with most permissions', color: '#F97316', icon: 'manage_accounts', perms: 'User management, products, orders, complaints, notifications' },
    { key: 'moderator', name: 'Moderator', desc: 'Content moderation and complaint handling', color: '#3B82F6', icon: 'verified_user', perms: 'Products, orders, complaints' },
    { key: 'analyst', name: 'Analyst', desc: 'View analytics and reports only', color: '#14B8A6', icon: 'analytics', perms: 'Analytics dashboard, call analytics, export data' },
    { key: 'finance', name: 'Finance', desc: 'Financial reporting and order management', color: '#22C55E', icon: 'account_balance', perms: 'Orders, payments, financial reports' },
    { key: 'customer_relations', name: 'Customer Relations', desc: 'Handle user support and complaints', color: '#8B5CF6', icon: 'support_agent', perms: 'Complaints, notifications, user support' },
    { key: 'engineer', name: 'Engineer', desc: 'Technical access and system management', color: '#6366F1', icon: 'engineering', perms: 'System settings, technical tools' },
    { key: 'agrihub_manager', name: 'AgriHub Manager', desc: 'Order tracking and aggregation at AgriHub/Cooperative level', color: '#00695C', icon: 'hub', perms: 'View orders, delivery tracking, financial summaries (read-only)' }
  ];
  const active = allTeamMembers.filter(m => m.is_active === true);
  const grid = document.getElementById('roles-grid');
  grid.innerHTML = roles.map(r => {
    const count = active.filter(m => {
      const mr = (m.role || 'admin').toLowerCase();
      return mr === r.key || (r.key === 'admin' && !mr) || (r.key === 'superadmin' && (mr === 'superadmin' || mr === 'super_admin'));
    }).length;
    return `<div class="role-card" style="border-left-color:${r.color};">
      <div class="role-header">
        <div class="role-icon" style="background:${r.color}15;"><span class="material-icons-outlined" style="color:${r.color};">${r.icon}</span></div>
        <div>
          <div class="role-name">${r.name}<span class="role-count" style="background:${r.color}15;color:${r.color};">${count} members</span></div>
        </div>
      </div>
      <div class="role-desc">${r.desc}</div>
      <div class="role-perms">Permissions: ${r.perms}</div>
    </div>`;
  }).join('');
}

function showAddTeamMemberModal() {
  document.getElementById('team-modal-title').textContent = 'Add Team Member';
  document.getElementById('team-edit-id').value = '';
  document.getElementById('team-name').value = '';
  document.getElementById('team-email').value = '';
  document.getElementById('team-password').value = '';
  document.getElementById('team-email').disabled = false;
  document.getElementById('team-password-group').classList.remove('hidden');
  document.getElementById('team-role').value = 'admin';
  document.getElementById('team-agrihub-fields').classList.add('hidden');
  document.getElementById('team-district').value = '';
  document.getElementById('team-subcounty').value = '';
  document.getElementById('team-agrihub-name').value = '';
  document.querySelectorAll('#team-permissions input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.getElementById('team-modal').classList.remove('hidden');
}

function editTeamMember(id) {
  const member = allTeamMembers.find(m => m.id === id);
  if (!member) return;
  document.getElementById('team-modal-title').textContent = 'Edit Team Member';
  document.getElementById('team-edit-id').value = id;
  document.getElementById('team-name').value = member.name || '';
  document.getElementById('team-email').value = member.email || '';
  document.getElementById('team-email').disabled = true;
  document.getElementById('team-password-group').classList.add('hidden');
  document.getElementById('team-role').value = (member.role || 'admin').toLowerCase();
  onTeamRoleChange();
  document.getElementById('team-district').value = member.district || '';
  document.getElementById('team-subcounty').value = member.subcounty || '';
  document.getElementById('team-agrihub-name').value = member.agrihub_name || member.agrihub || '';
  const perms = member.permissions || [];
  document.querySelectorAll('#team-permissions input[type="checkbox"]').forEach(cb => {
    cb.checked = perms.includes(cb.value);
  });
  document.getElementById('team-modal').classList.remove('hidden');
}

function onTeamRoleChange() {
  const role = document.getElementById('team-role').value;
  const fields = document.getElementById('team-agrihub-fields');
  if (role === 'agrihub_manager') { fields.classList.remove('hidden'); } else { fields.classList.add('hidden'); }
}

async function saveTeamMember(e) {
  e.preventDefault();
  const editId = document.getElementById('team-edit-id').value;
  const name = document.getElementById('team-name').value.trim();
  const email = document.getElementById('team-email').value.trim();
  const password = document.getElementById('team-password').value.trim();
  const role = document.getElementById('team-role').value;
  const district = document.getElementById('team-district').value.trim();
  const subcounty = document.getElementById('team-subcounty').value.trim();
  const agrihubName = document.getElementById('team-agrihub-name').value.trim();
  const permissions = [];
  document.querySelectorAll('#team-permissions input[type="checkbox"]:checked').forEach(cb => permissions.push(cb.value));

  if (!name || !email) { showToast('Name and email are required', 'error'); return; }
  if (!editId && !password) { showToast('Password is required for new members', 'error'); return; }

  const payload = {
    name, email, role,
    permissions,
    is_active: true,
  };
  if (role === 'agrihub_manager') {
    payload.district = district;
    payload.subcounty = subcounty;
    payload.agrihub_name = agrihubName;
  }

  try {
    if (editId) {
      const { error } = await sbClient.from('admin_users').update(payload).eq('id', editId);
      if (error) throw error;
      showToast(name + ' has been updated', 'success');
    } else {
      // Create new: first create auth user, then admin record
      const { data: authData, error: authErr } = await sbClient.auth.signUp({ email, password });
      if (authErr) throw authErr;
      payload.auth_user_id = authData.user?.id || null;
      payload.created_at = new Date().toISOString();
      const { error } = await sbClient.from('admin_users').insert(payload);
      if (error) throw error;
      showToast(name + ' has been added to the team', 'success');
    }
    closeModal('team-modal');
    loadTeamManagement();
  } catch (err) {
    showToast('Error: ' + (err.message || err), 'error');
  }
}

async function deactivateTeamMember(id, name) {
  if (!confirm('Deactivate ' + name + '? They will no longer be able to access the admin panel.')) return;
  try {
    const { error } = await sbClient.from('admin_users').update({ is_active: false }).eq('id', id);
    if (error) throw error;
    showToast(name + ' has been deactivated', 'success');
    loadTeamManagement();
  } catch (err) {
    showToast('Failed to deactivate: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════
//  PSA DASHBOARD
// ═══════════════════════════════════════════════════
let allPsaProducts = [];
let allPsaOrders = [];

async function loadPsaDashboard() {
  try {
    const [prodRes, orderRes] = await Promise.all([
      sbClient.from('products').select('*').eq('is_psa', true),
      sbClient.from('orders').select('*').eq('is_psa_order', true).order('created_at', { ascending: false })
    ]);
    allPsaProducts = prodRes.data || [];
    allPsaOrders = orderRes.data || [];
    renderPsaStats();
    renderPsaProducts();
    renderPsaOrders();
    renderPsaStatusBreakdown();
  } catch (e) {
    console.error('[PSA] Load error:', e);
  }
}

function renderPsaStats() {
  const activeProds = allPsaProducts.filter(p => p.is_active === true);
  const pendingOrders = allPsaOrders.filter(o => ['Pending','Confirmed','Preparing','Ready','In Transit','Awaiting Confirmation'].includes(o.status));
  const totalRevenue = allPsaOrders.filter(o => o.status === 'Delivered' || o.status === 'Completed').reduce((s, o) => s + ((o.total_amount || 0) * 1), 0);
  setText('stat-psa-products', allPsaProducts.length);
  setText('stat-psa-active', activeProds.length);
  setText('stat-psa-orders', allPsaOrders.length);
  setText('stat-psa-pending', pendingOrders.length);
  const revEl = document.querySelector('#psa-revenue-display .stat-value');
  if (revEl) revEl.textContent = 'UGX ' + totalRevenue.toLocaleString();
}

function renderPsaProducts() {
  const tbody = document.getElementById('psa-products-tbody');
  if (!allPsaProducts.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-placeholder">No PSA products found</td></tr>';
    return;
  }
  tbody.innerHTML = allPsaProducts.map(p => {
    const status = p.is_active ? '<span class="status-badge-sm status-active">Active</span>' : '<span class="status-badge-sm status-inactive">Inactive</span>';
    return `<tr>
      <td><strong>${p.name || '-'}</strong></td>
      <td>${p.category || '-'}</td>
      <td>${(p.price || 0).toLocaleString()}</td>
      <td>${p.stock_quantity ?? '-'}</td>
      <td>${status}</td>
      <td>${p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}</td>
    </tr>`;
  }).join('');
}

function renderPsaOrders(filtered) {
  const orders = filtered || allPsaOrders;
  const tbody = document.getElementById('psa-orders-tbody');
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">No PSA orders found</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const items = o.items ? (typeof o.items === 'string' ? JSON.parse(o.items) : o.items) : [];
    const itemText = Array.isArray(items) ? items.map(i => i.name || i.product_name || 'Item').join(', ') : '-';
    const confirmed = o.seller_confirmed ? '<span class="status-badge-sm status-active">Yes</span>' : '<span class="status-badge-sm status-pending">No</span>';
    return `<tr>
      <td>${(o.id || '').toString().substring(0, 8)}...</td>
      <td>${o.buyer_name || o.buyer_id?.substring(0, 8) || '-'}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${itemText}">${itemText}</td>
      <td>${(o.total_amount || 0).toLocaleString()}</td>
      <td><span class="status-badge">${o.status || '-'}</span></td>
      <td>${confirmed}</td>
      <td>${o.created_at ? new Date(o.created_at).toLocaleDateString() : '-'}</td>
    </tr>`;
  }).join('');
}

function filterPsaOrders() {
  const status = document.getElementById('psa-orders-status-filter').value;
  if (status === 'all') { renderPsaOrders(); return; }
  renderPsaOrders(allPsaOrders.filter(o => o.status === status));
}

function renderPsaStatusBreakdown() {
  const el = document.getElementById('psa-status-breakdown');
  const statusCounts = {};
  allPsaOrders.forEach(o => { statusCounts[o.status || 'Unknown'] = (statusCounts[o.status || 'Unknown'] || 0) + 1; });
  const statusColors = { Pending: '#E88A2D', Confirmed: '#3B82F6', Preparing: '#8B5CF6', 'In Transit': '#17A2B8', Delivered: '#01AC66', Completed: '#22C55E', Cancelled: '#EF4444' };
  el.innerHTML = Object.entries(statusCounts).map(([status, count]) => {
    const pct = allPsaOrders.length ? Math.round(count / allPsaOrders.length * 100) : 0;
    const color = statusColors[status] || '#6B7280';
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <span style="font-size:13px;font-weight:600;min-width:100px;">${status}</span>
      <div style="flex:1;background:#f3f4f6;border-radius:6px;height:22px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:6px;display:flex;align-items:center;justify-content:center;">
          <span style="color:#fff;font-size:11px;font-weight:600;">${count}</span>
        </div>
      </div>
      <span style="font-size:12px;color:#6B7280;min-width:35px;">${pct}%</span>
    </div>`;
  }).join('') || '<p style="color:#999;">No orders yet</p>';
}

// ═══════════════════════════════════════════════════
//  AGRIHUB DASHBOARD
// ═══════════════════════════════════════════════════
let allAgrihubs = [];
let allAgrihubManagers = [];

async function loadAgrihubDashboard() {
  try {
    const [hubRes, mgrRes] = await Promise.all([
      sbClient.from('agrihubs').select('*').order('name', { ascending: true }),
      sbClient.from('admin_users').select('*').eq('role', 'agrihub_manager')
    ]);
    allAgrihubs = hubRes.data || [];
    allAgrihubManagers = mgrRes.data || [];
    renderAgrihubStats();
    renderAgrihubTable();
    renderAgrihubManagers();
    populateAgrihubDistrictFilter();
  } catch (e) {
    console.error('[AgriHub] Load error:', e);
    // If agrihubs table doesn't exist, show a message
    document.getElementById('agrihub-tbody').innerHTML = '<tr><td colspan="7" class="loading-placeholder">No AgriHub data available. Table may not exist yet.</td></tr>';
    document.getElementById('agrihub-managers-tbody').innerHTML = '';
    renderAgrihubManagersFromTeam();
  }
}

function renderAgrihubManagersFromTeam() {
  // Fallback: pull AgriHub manager info from admin_users even if agrihubs table is empty
  const mgrs = allAgrihubManagers;
  const districts = new Set(mgrs.map(m => m.district).filter(Boolean));
  setText('stat-agrihub-total', allAgrihubs.length);
  setText('stat-agrihub-managers', mgrs.length);
  setText('stat-agrihub-districts', districts.size);
  setText('stat-agrihub-members', '-');
  renderAgrihubManagers();
}

function renderAgrihubStats() {
  const districts = new Set(allAgrihubs.map(h => h.district).filter(Boolean));
  const totalMembers = allAgrihubs.reduce((s, h) => s + ((h.member_count || h.members_count) || 0), 0);
  setText('stat-agrihub-total', allAgrihubs.length);
  setText('stat-agrihub-managers', allAgrihubManagers.length);
  setText('stat-agrihub-districts', districts.size);
  setText('stat-agrihub-members', totalMembers || '-');
}

function renderAgrihubTable(filtered) {
  const hubs = filtered || allAgrihubs;
  const tbody = document.getElementById('agrihub-tbody');
  if (!hubs.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-placeholder">No AgriHub centers found</td></tr>';
    return;
  }
  tbody.innerHTML = hubs.map(h => {
    const mgr = allAgrihubManagers.find(m => m.agrihub_id === h.id || (m.agrihub_name || '').toLowerCase() === (h.name || '').toLowerCase());
    const mgrName = mgr ? mgr.name : '<span style="color:#999;">Unassigned</span>';
    const members = h.member_count || h.members_count || 0;
    const orders = h.order_count || h.orders_count || 0;
    const isActive = h.is_active !== false;
    const statusClass = isActive ? 'status-active' : 'status-inactive';
    return `<tr>
      <td><strong>${h.name || '-'}</strong></td>
      <td>${h.district || '-'}</td>
      <td>${h.subcounty || '-'}</td>
      <td>${mgrName}</td>
      <td>${members}</td>
      <td>${orders}</td>
      <td><span class="status-badge-sm ${statusClass}">${isActive ? 'Active' : 'Inactive'}</span></td>
    </tr>`;
  }).join('');
}

function renderAgrihubManagers() {
  const tbody = document.getElementById('agrihub-managers-tbody');
  if (!allAgrihubManagers.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-placeholder">No AgriHub managers found</td></tr>';
    return;
  }
  tbody.innerHTML = allAgrihubManagers.map(m => {
    const statusClass = m.is_active ? 'status-active' : 'status-inactive';
    return `<tr>
      <td><strong>${m.name || '-'}</strong></td>
      <td>${m.email || '-'}</td>
      <td>${m.agrihub_name || m.agrihub || '-'}</td>
      <td>${m.district || '-'}</td>
      <td>${m.subcounty || '-'}</td>
      <td><span class="status-badge-sm ${statusClass}">${m.is_active ? 'Active' : 'Inactive'}</span></td>
    </tr>`;
  }).join('');
}

function populateAgrihubDistrictFilter() {
  const select = document.getElementById('agrihub-district-filter');
  if (!select) return;
  const districts = [...new Set(allAgrihubs.map(h => h.district).filter(Boolean))].sort();
  select.innerHTML = '<option value="all">All Districts</option>' + districts.map(d => `<option value="${d}">${d}</option>`).join('');
}

function filterAgrihubs() {
  const district = document.getElementById('agrihub-district-filter').value;
  if (district === 'all') { renderAgrihubTable(); return; }
  renderAgrihubTable(allAgrihubs.filter(h => h.district === district));
}
