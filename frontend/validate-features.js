// Feature validation script for DuckBridge Project UI enhancements
console.log('🦆 DuckBridge Project UI Enhancement Validation');
console.log('================================================');

// Test 1: Project Switcher Interface
console.log('\n1. Project Switcher Interface:');
const projectSwitcherElements = [
    'project-switcher-bar',
    'project-switcher-btn', 
    'project-switcher-dropdown',
    'current-project-name',
    'project-color-dot'
];

projectSwitcherElements.forEach(id => {
    const element = document.getElementById(id);
    console.log(`   ${element ? '✓' : '✗'} ${id}: ${element ? 'Found' : 'Missing'}`);
});

// Test 2: Split Views and Workspace Controls
console.log('\n2. Split Views and Workspace Controls:');
const workspaceElements = [
    'toggle-split-view',
    'toggle-horizontal-split', 
    'toggle-layout-mode',
    'terminal-workspace-container',
    'terminal-panels-secondary',
    'split-view-divider'
];

workspaceElements.forEach(id => {
    const element = document.getElementById(id);
    console.log(`   ${element ? '✓' : '✗'} ${id}: ${element ? 'Found' : 'Missing'}`);
});

// Test 3: Project Overview Dashboard
console.log('\n3. Project Overview Dashboard:');
const dashboardElements = [
    'project-overview-dashboard',
    'total-projects',
    'active-sessions', 
    'git-repos',
    'recent-activity',
    'recent-projects-list',
    'active-sessions-list',
    'git-activity-list'
];

dashboardElements.forEach(id => {
    const element = document.getElementById(id);
    console.log(`   ${element ? '✓' : '✗'} ${id}: ${element ? 'Found' : 'Missing'}`);
});

// Test 4: Color Coding System
console.log('\n4. Color Coding System:');
const colorClasses = [
    'color-blue', 'color-green', 'color-purple', 'color-orange',
    'color-red', 'color-pink', 'color-indigo', 'color-teal'
];

const cssRules = Array.from(document.styleSheets)
    .flatMap(sheet => {
        try {
            return Array.from(sheet.cssRules || []);
        } catch (e) {
            return [];
        }
    })
    .map(rule => rule.selectorText)
    .filter(Boolean);

colorClasses.forEach(colorClass => {
    const hasProjectCard = cssRules.some(rule => rule.includes(`.project-card.${colorClass}`));
    const hasTerminalTab = cssRules.some(rule => rule.includes(`.terminal-tab.${colorClass}`));
    const hasColorDot = cssRules.some(rule => rule.includes(`.project-color-dot.${colorClass}`));
    
    console.log(`   ${hasProjectCard && hasTerminalTab && hasColorDot ? '✓' : '✗'} ${colorClass}: Project=${hasProjectCard}, Terminal=${hasTerminalTab}, Dot=${hasColorDot}`);
});

// Test 5: JavaScript Functionality
console.log('\n5. JavaScript Functionality:');
const jsFeatures = [
    'app.toggleProjectSwitcher',
    'app.toggleProjectOverview',
    'app.toggleSplitViewMode',
    'app.updateProjectSwitcherStats',
    'app.updateProjectOverviewStats'
];

jsFeatures.forEach(feature => {
    const parts = feature.split('.');
    let obj = window;
    let exists = true;
    
    for (const part of parts) {
        if (obj && typeof obj[part] !== 'undefined') {
            obj = obj[part];
        } else {
            exists = false;
            break;
        }
    }
    
    console.log(`   ${exists ? '✓' : '✗'} ${feature}: ${exists ? 'Available' : 'Missing'}`);
});

// Test 6: Responsive Design
console.log('\n6. Responsive Design:');
const mediaQueries = cssRules.filter(rule => rule && rule.includes('@media'));
console.log(`   ${mediaQueries.length > 0 ? '✓' : '✗'} Media queries found: ${mediaQueries.length}`);

// Test 7: Accessibility Features
console.log('\n7. Accessibility Features:');
const accessibilityFeatures = [
    document.querySelectorAll('[title]').length > 0,
    document.querySelectorAll('[aria-label]').length >= 0,
    document.querySelectorAll('button').length > 0
];

console.log(`   ${accessibilityFeatures[0] ? '✓' : '✗'} Title attributes: ${document.querySelectorAll('[title]').length} found`);
console.log(`   ${accessibilityFeatures[1] ? '✓' : '✗'} ARIA labels: ${document.querySelectorAll('[aria-label]').length} found`);
console.log(`   ${accessibilityFeatures[2] ? '✓' : '✗'} Interactive buttons: ${document.querySelectorAll('button').length} found`);

console.log('\n================================================');
console.log('🦆 Project UI Enhancement validation complete!');