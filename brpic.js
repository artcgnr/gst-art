//  dd/mm/yyyy  Date 
function parseDate(dateString) {
  const [day, month, year] = dateString.split('/').map(Number);
  return new Date(year, month - 1, day); // Month is 0-indexed
}


//branch name---------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    // Retrieve branch information from localStorage
    const branchName = localStorage.getItem('branchName');
  
    if (branchName) {
      // Display the branch name
      document.getElementById('branchName').textContent = branchName;
      document.getElementById('hiddenBranchName').value = branchName;
    } else {
      // Redirect back to login if no branch name found
      window.location.href = 'index.html';
    }
  });
  

 