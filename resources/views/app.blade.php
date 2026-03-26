<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">

        <title>{{ config('app.name', 'B3Sound') }}</title>

        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600" rel="stylesheet" />

        @vite('resources/js/app.js')
        @inertiaHead
    </head>
    <body class="min-h-screen bg-gray-950 text-white antialiased">
        @inertia
    </body>
</html>
