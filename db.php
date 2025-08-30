<?php
$host = "localhost";
$user = "root";  // change if needed
$pass = "8877";      // change if needed
$db   = "flashcards_db";

$conn = new mysqli($host, $user, $pass, $db);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
?>
