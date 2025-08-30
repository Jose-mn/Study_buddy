<?php
session_start();
if (!isset($_SESSION['username'])) {
    header("Location: login.html"); // redirect back if not logged in
    exit();
}
?>

<h1>Welcome, <?php echo $_SESSION['username']; ?>!</h1>
<a href="logout.php">Logout</a>
