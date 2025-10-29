/**
 * Session Manager - Handles authentication tokens, session persistence, and automatic refresh
 */
class SessionManager {
  constructor() {
    this.token = null;
    this.user = null;
    this.refreshTimer = null;
    this.isRefreshing = false;
    this.refreshPromise = null;

    // Initialize session from storage
    this.loadSession();

    // Set up automatic token refresh
    this.setupAutoRefresh();

    // Set up session monitoring
    this.setupSessionMonitoring();
  }

  /**
   * Load session from localStorage
   */
  loadSession() {
    try {
      const token = localStorage.getItem('auth_token');
      const user = localStorage.getItem('auth_user');
      const expiry = localStorage.getItem('auth_expiry');

      if (token && user && expiry) {
        const expiryTime = parseInt(expiry);
        if (Date.now() < expiryTime) {
          this.token = token;
          this.user = JSON.parse(user);
          console.log('✅ Session restored from storage');
        } else {
          // Token expired, clear storage
          this.clearSession();
        }
      }
    } catch (error) {
      console.error('Error loading session:', error);
      this.clearSession();
    }
  }

  /**
   * Save session to localStorage
   */
  saveSession(token, user, expiresIn) {
    try {
      const expiryTime = Date.now() + (expiresIn * 1000); // Convert to milliseconds
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      localStorage.setItem('auth_expiry', expiryTime.toString());

      this.token = token;
      this.user = user;

      console.log('💾 Session saved to storage');
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  /**
   * Clear session data
   */
  clearSession() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_expiry');

    this.token = null;
    this.user = null;

    // Clear any pending refresh timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    console.log('🗑️ Session cleared');
  }

  /**
   * Set up automatic token refresh before expiry
   */
  setupAutoRefresh() {
    if (!this.token) return;

    // Refresh token 5 minutes before expiry
    const refreshTime = 5 * 60 * 1000; // 5 minutes

    this.refreshTimer = setTimeout(() => {
      this.refreshToken();
    }, refreshTime);

    console.log('⏰ Auto-refresh scheduled');
  }

  /**
   * Refresh authentication token
   */
  async refreshToken() {
    if (this.isRefreshing) return this.refreshPromise;

    this.isRefreshing = true;

    try {
      this.refreshPromise = fetch('/.netlify/functions/sales-auth-check', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Token refresh failed');
        }
        return response.json();
      })
      .then(data => {
        if (data.authenticated) {
          // Token is still valid, schedule next refresh
          this.setupAutoRefresh();
          return true;
        } else {
          throw new Error('Token expired');
        }
      });

      return await this.refreshPromise;

    } catch (error) {
      console.error('Token refresh failed:', error);
      this.logout();
      throw error;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Set up session monitoring and activity tracking
   */
  setupSessionMonitoring() {
    let lastActivity = Date.now();

    // Track user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, () => {
        lastActivity = Date.now();
      }, { passive: true });
    });

    // Check for session expiry every minute
    setInterval(() => {
      if (this.token) {
        const timeSinceActivity = Date.now() - lastActivity;
        const sessionTimeout = 30 * 60 * 1000; // 30 minutes of inactivity

        if (timeSinceActivity > sessionTimeout) {
          console.log('⏰ Session expired due to inactivity');
          this.logout();
        }
      }
    }, 60 * 1000); // Check every minute
  }

  /**
   * Login user with credentials
   */
  async login(email, password) {
    try {
      const response = await fetch('/.netlify/functions/sales-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      if (data.success && data.data) {
        this.saveSession(data.data.token, data.data.user, 8 * 60 * 60); // 8 hours
        this.setupAutoRefresh();

        console.log('✅ User logged in successfully');
        return { success: true, user: data.data.user };
      } else {
        throw new Error(data.message || 'Login failed');
      }

    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      // Call logout endpoint to blacklist token
      await fetch('/.netlify/functions/sales-logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.warn('Logout API call failed, clearing local session anyway:', error);
    }

    this.clearSession();

    // Redirect to login or reload page
    if (window.location.pathname.includes('/sales') || window.location.pathname.includes('/admin')) {
      window.location.reload();
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated() {
    if (!this.token) return false;

    try {
      // Check token validity with server
      const response = await fetch('/.netlify/functions/sales-auth-check', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      return data.authenticated === true;

    } catch (error) {
      console.error('Auth check failed:', error);
      return false;
    }
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.user;
  }

  /**
   * Get auth token
   */
  getToken() {
    return this.token;
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(permission) {
    if (!this.user || !this.user.permissions) return false;
    return this.user.permissions.includes(permission);
  }

  /**
   * Check if user has specific role
   */
  hasRole(role) {
    if (!this.user) return false;
    return this.user.role === role;
  }

  /**
   * Get auth headers for API requests
   */
  getAuthHeaders() {
    if (!this.token) return {};
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }
}

// Create singleton instance
const sessionManager = new SessionManager();

module.exports = sessionManager;