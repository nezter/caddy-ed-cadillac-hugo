const fs = require('fs');

// Read current tasks
const tasksData = JSON.parse(fs.readFileSync('.taskmaster/tasks/tasks.json', 'utf8'));
const masterTasks = tasksData.master.tasks;

console.log("🔧 ADDING DATA SEEDING AND ACCOUNT CREATION TASKS\n");

// Add subtasks to task 8 (Authentication System)
const authTask = masterTasks.find(t => t.id === 8);
if (authTask) {
  authTask.subtasks = [
    {
      id: "8.1",
      title: "Design user authentication schema and data models",
      description: "Create database schema for users, roles, permissions, and sessions",
      dependencies: [],
      details: "Design tables for users, roles, user_role_mapping, sessions, and permissions. Include fields for email, password_hash, role, status, created_at, updated_at.",
      testStrategy: "Validate schema with test data and ensure proper relationships",
      status: "pending"
    },
    {
      id: "8.2", 
      title: "Implement user registration and account creation API",
      description: "Create endpoints for user registration, account creation, and email verification",
      dependencies: ["8.1"],
      details: "Build POST /api/auth/register, POST /api/auth/verify-email endpoints. Include validation, password hashing, and email verification flows.",
      testStrategy: "Test registration with valid/invalid data, email verification flow, and duplicate prevention",
      status: "pending"
    },
    {
      id: "8.3",
      title: "Implement login and authentication API endpoints", 
      description: "Create secure login endpoints with JWT token generation and session management",
      dependencies: ["8.1", "8.2"],
      details: "Build POST /api/auth/login, POST /api/auth/logout, POST /api/auth/refresh-token. Implement JWT token generation, validation, and secure session management.",
      testStrategy: "Test successful/failed login, token validation, session management, and logout functionality",
      status: "pending"
    },
    {
      id: "8.4",
      title: "Create role-based access control (RBAC) system",
      description: "Implement role-based permissions and access control middleware",
      dependencies: ["8.1", "8.3"],
      details: "Create RBAC middleware for role-based access control. Define roles (admin, sales_manager, sales_rep, viewer) and implement permission checks.",
      testStrategy: "Test role-based access to different endpoints and verify permission enforcement",
      status: "pending"
    },
    {
      id: "8.5",
      title: "Build user management dashboard UI components",
      description: "Create React components for user management, login forms, and admin interfaces",
      dependencies: ["8.3", "8.4"],
      details: "Build LoginForm, RegisterForm, UserManagementTable, RoleManagement components. Include validation, error handling, and responsive design.",
      testStrategy: "Test UI components, form validation, error states, and responsive behavior",
      status: "pending"
    },
    {
      id: "8.6",
      title: "Implement password reset and account recovery flows",
      description: "Create secure password reset and account recovery functionality",
      dependencies: ["8.2", "8.3"],
      details: "Build POST /api/auth/forgot-password, POST /api/auth/reset-password endpoints. Include secure token generation, email delivery, and password validation.",
      testStrategy: "Test password reset flow, token validation, security measures, and email delivery",
      status: "pending"
    },
    {
      id: "8.7",
      title: "Create initial admin and sales user accounts",
      description: "Seed database with initial admin and sales team user accounts",
      dependencies: ["8.2", "8.4"],
      details: "Create data seeding scripts for initial user setup. Include admin account, sales manager accounts, and sales representative accounts with proper roles and permissions.",
      testStrategy: "Verify seeded accounts can login, have correct roles, and proper permissions",
      status: "pending"
    },
    {
      id: "8.8",
      title: "Integrate authentication with existing sales dashboard",
      description: "Connect authentication system with sales dashboard and implement protected routes",
      dependencies: ["8.3", "8.4", "8.5"],
      details: "Integrate auth middleware with sales dashboard routes. Implement protected routes, role-based navigation, and user session management across the application.",
      testStrategy: "Test protected route access, role-based navigation, session persistence, and integration with existing features",
      status: "pending"
    }
  ];
}

// Add new data seeding task (Task 44)
const dataSeedingTask = {
  id: 44,
  title: "Implement comprehensive data seeding system",
  description: "Create data seeding scripts for customers, leads, vehicles, and sample data",
  status: "pending",
  priority: "high",
  dependencies: [9, 8.7], // Database schema and user accounts
  details: "",
  testStrategy: "",
  subtasks: [
    {
      id: "44.1",
      title: "Create customer data seeding scripts",
      description: "Generate realistic sample customer data with demographics and contact information",
      dependencies: [],
      details: "Create scripts to seed 100+ sample customers with realistic names, emails, phone numbers, addresses, and demographic data. Include different customer segments and types.",
      testStrategy: "Verify seeded customer data quality, uniqueness, and proper format",
      status: "pending"
    },
    {
      id: "44.2",
      title: "Create lead data seeding scripts", 
      description: "Generate sample lead data with various sources, statuses, and scoring",
      dependencies: ["44.1"],
      details: "Create scripts to seed 200+ sample leads with different sources (website, phone, email, referral), statuses, lead scores, and assignment to sales reps.",
      testStrategy: "Verify lead data relationships, proper assignment, and realistic distribution",
      status: "pending"
    },
    {
      id: "44.3",
      title: "Create vehicle inventory seeding scripts",
      description: "Generate sample vehicle inventory with Cadillac models, pricing, and specifications",
      dependencies: [],
      details: "Create scripts to seed current Cadillac vehicle inventory with models, trims, pricing, VIN numbers, specifications, and availability status.",
      testStrategy: "Verify vehicle data accuracy, completeness, and realistic inventory mix",
      status: "pending"
    },
    {
      id: "44.4",
      title: "Create interaction and appointment seeding scripts",
      description: "Generate sample customer interactions, appointments, and communication history",
      dependencies: ["44.1", "44.2"],
      details: "Create scripts to seed customer interactions, appointments, follow-ups, and communication history. Include different interaction types and outcomes.",
      testStrategy: "Verify interaction data relationships, realistic timelines, and proper linking",
      status: "pending"
    },
    {
      id: "44.5",
      title: "Create sales performance and analytics seeding",
      description: "Generate sample sales data, performance metrics, and analytics history",
      dependencies: ["44.1", "44.2", "44.3"],
      details: "Create scripts to seed historical sales data, conversion rates, performance metrics, and analytics data for dashboard testing and demonstration.",
      testStrategy: "Verify sales data accuracy, realistic performance metrics, and proper analytics calculations",
      status: "pending"
    }
  ]
};

// Add new account management task (Task 45)
const accountManagementTask = {
  id: 45,
  title: "Build comprehensive account management system",
  description: "Create account management features for users, customers, and admin operations",
  status: "pending", 
  priority: "high",
  dependencies: [8, 44], // Authentication and data seeding
  details: "",
  testStrategy: "",
  subtasks: [
    {
      id: "45.1",
      title: "Create user profile management system",
      description: "Build user profile editing, preferences, and account settings",
      dependencies: ["8.7"],
      details: "Create user profile management features including profile editing, password change, notification preferences, and account settings. Include validation and security measures.",
      testStrategy: "Test profile updates, password changes, preference management, and security features",
      status: "pending"
    },
    {
      id: "45.2",
      title: "Implement customer account management",
      description: "Build customer account creation, management, and relationship features",
      dependencies: ["44.1", "8.7"],
      details: "Create customer account management including customer creation, profile editing, relationship management, and account linking. Include customer portal access.",
      testStrategy: "Test customer account creation, profile management, relationship features, and portal access",
      status: "pending"
    },
    {
      id: "45.3",
      title: "Build admin user management interface",
      description: "Create admin interface for user management, role assignment, and account administration",
      dependencies: ["8.4", "8.7", "45.1"],
      details: "Build admin interface for user management including user creation, role assignment, permission management, account suspension/reactivation, and activity monitoring.",
      testStrategy: "Test admin user management features, role assignment, permission enforcement, and activity monitoring",
      status: "pending"
    },
    {
      id: "45.4",
      title: "Create account security and audit logging",
      description: "Implement account security features, audit logging, and compliance tracking",
      dependencies: ["8.3", "8.4", "45.1"],
      details: "Create account security features including two-factor authentication, login attempt monitoring, audit logging, and compliance tracking. Include security alerts and reporting.",
      testStrategy: "Test security features, audit logging, compliance tracking, and alert systems",
      status: "pending"
    },
    {
      id: "45.5",
      title: "Build bulk account operations and imports",
      description: "Create bulk account creation, import/export, and batch operations",
      dependencies: ["44.1", "45.1", "45.2"],
      details: "Create bulk account operations including CSV import/export, batch user creation, bulk customer account setup, and mass account updates. Include validation and error handling.",
      testStrategy: "Test bulk operations, import/export functionality, batch processing, and error handling",
      status: "pending"
    }
  ]
};

// Add new tasks to the master tasks array
masterTasks.push(dataSeedingTask, accountManagementTask);

// Update metadata
tasksData.master.metadata.lastModified = new Date().toISOString();
tasksData.master.metadata.taskCount = masterTasks.length;
tasksData.master.metadata.completedCount = masterTasks.filter(task => task.status === 'done').length;

// Write back updated tasks
fs.writeFileSync('.taskmaster/tasks/tasks.json', JSON.stringify(tasksData, null, 2));

console.log("✅ SUCCESSFULLY ADDED DATA SEEDING AND ACCOUNT CREATION TASKS");
console.log(`📊 Total tasks now: ${masterTasks.length}`);
console.log("🎯 Added Task 44: Data seeding system with 5 subtasks");
console.log("🎯 Added Task 45: Account management system with 5 subtasks");
console.log("🎯 Enhanced Task 8: Authentication system with 8 subtasks");

// Update dependencies for tasks that depend on the new features
const tasksToUpdate = [
  { id: 12, addDeps: [44] }, // Lead scoring needs data
  { id: 14, addDeps: [8, 44] }, // Sales rep assignment needs users and data
  { id: 15, addDeps: [44, 45] }, // Customer interactions needs data and accounts
  { id: 16, addDeps: [44] }, // Customer search needs seeded data
  { id: 18, addDeps: [44] }, // Analytics dashboard needs seeded data
  { id: 35, addDeps: [44] }, // Customer search in Turso needs data
  { id: 36, addDeps: [44] }, // Lead caching needs data
  { id: 37, addDeps: [44] }, // Analytics data migration needs data
  { id: 38, addDeps: [8, 45] }, // Session caching needs account management
  { id: 40, addDeps: [44] }  // Inventory search needs vehicle data
];

tasksToUpdate.forEach(({ id, addDeps }) => {
  const task = masterTasks.find(t => t.id === id);
  if (task) {
    addDeps.forEach(depId => {
      if (!task.dependencies.includes(depId)) {
        task.dependencies.push(depId);
      }
    });
  }
});

// Write final updated tasks
fs.writeFileSync('.taskmaster/tasks/tasks.json', JSON.stringify(tasksData, null, 2));

console.log("\n🔗 UPDATED DEPENDENCIES FOR RELATED TASKS");
console.log("✅ Tasks now properly depend on data seeding and account management");
console.log("🚀 Ready for parallel work on data seeding and account creation!");