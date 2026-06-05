const fs = require('fs');
let content = fs.readFileSync('js/diagnostics.js', 'utf8');

// I inserted it perfectly the last time but for some reason I ran the injection script twice?
// Yes, there are two copies of R15 in the file.
// Let's restore and run just ONCE perfectly.
