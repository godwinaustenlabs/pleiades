import re

with open('apps/web/src/pages/Finance.tsx', 'r') as f:
    content = f.read()

# 1. Add ledger-view to Tab type
old_type = "type Tab = 'ledgers' | 'journals' | 'trial-balance' | 'invoices' | 'fund-requests' | 'accounts' | 'channels' | 'tasks';"
new_type = "type Tab = 'ledger-view' | 'ledgers' | 'journals' | 'trial-balance' | 'invoices' | 'fund-requests' | 'accounts' | 'channels' | 'tasks';"
content = content.replace(old_type, new_type)

# 2. Add ledger-view to TABS
old_tabs = """    const all = [
      { id: 'ledgers', label: 'Ledgers', icon: Wallet, feature: 'ledgers' },"""
new_tabs = """    const all = [
      { id: 'ledger-view', label: 'Ledger Viewer', icon: FileText, feature: 'ledgers' },
      { id: 'ledgers', label: 'Ledgers', icon: Wallet, feature: 'ledgers' },"""
content = content.replace(old_tabs, new_tabs)

# 3. Default tab to ledger-view
old_default = "const [tab, setTab] = useState<Tab>('ledgers');"
new_default = "const [tab, setTab] = useState<Tab>('ledger-view');"
content = content.replace(old_default, new_default)

# 4. fetchData logic
old_fetch = """    if (tab === 'ledgers' && selectedLedgerAccount) {"""
new_fetch = """    if (tab === 'ledger-view' && selectedLedgerAccount) {"""
content = content.replace(old_fetch, new_fetch)

# 5. UI logic
old_ui_ledger = "{tab === 'ledgers' && ("
new_ui_ledger = "{tab === 'ledger-view' && ("
content = content.replace(old_ui_ledger, new_ui_ledger)

# 6. GAGrid logic
old_ui_gagrid = "{tab !== 'tasks' && tab !== 'trial-balance' && tab !== 'ledgers' && ("
new_ui_gagrid = "{tab !== 'tasks' && tab !== 'trial-balance' && tab !== 'ledger-view' && ("
content = content.replace(old_ui_gagrid, new_ui_gagrid)

# 7. Add ledgers to GAGrid columns
old_gagrid_columns = "              tab === 'journals' ? ["
new_gagrid_columns = """              tab === 'ledgers' ? [
                { key: 'ledgerName', label: 'Ledger Name' },
                { key: 'description', label: 'Description' },
                { key: 'createdAt', label: 'Created At', type: 'date' as const },
              ] : tab === 'journals' ? ["""
content = content.replace(old_gagrid_columns, new_gagrid_columns)

with open('apps/web/src/pages/Finance.tsx', 'w') as f:
    f.write(content)

