/**
 * Thin API client. The frontend is presentation-only: every calculation,
 * parse and categorization happens server-side via these endpoints.
 */
const api = {
  async getDashboard() {
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error('Failed to load dashboard');
    return res.json();
  },

  async getCategories() {
    const res = await fetch('/api/categories');
    if (!res.ok) throw new Error('Failed to load categories');
    return res.json();
  },

  async addAlert(rawMessage) {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawMessage }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add transaction');
    return data;
  },

  async setCategory(id, category) {
    const res = await fetch(`/api/transactions/${id}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update category');
    return data;
  },
};
