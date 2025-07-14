// GREETING
function getGreeting() {
  const now = new Date();
  const hours = now.getHours();

  if (hours < 12) {
    return 'Good Morning,';
  } else if (hours < 18) {
    return 'Good Afternoon,';
  } else {
    return 'Good Evening,';
  }
}

// Set greeting ke elemen dengan ID greeting
document.getElementById('greeting').textContent = getGreeting();