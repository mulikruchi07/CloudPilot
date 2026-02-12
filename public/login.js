// On Login Button Click
signInWithPopup(auth, provider).then((result) => {
    // Redirect to dashboard on success
    window.location.href = "index.html";
});