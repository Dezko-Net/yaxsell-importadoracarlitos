$base = 'C:\Proyectos\PROJECT YAXSELL (FIREBASE)\src'
$files = Get-ChildItem -Path $base -Recurse -Include '*.ts','*.tsx' | Where-Object { -not $_.FullName.Contains('node_modules') -and -not $_.FullName.Contains('.next') }
$count = 0
foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw
    if ($content -match 'appwrite') {
        $newContent = $content
        # Single quotes
        $newContent = $newContent -replace "from '@/lib/appwrite-server'", "from '@/lib/db-server'"
        $newContent = $newContent -replace "from '@/lib/appwrite-admin'", "from '@/lib/db'"
        $newContent = $newContent -replace "from '@/lib/appwrite'", "from '@/lib/db'"
        $newContent = $newContent -replace "from './appwrite-server'", "from './db-server'"
        $newContent = $newContent -replace "from './appwrite-admin'", "from './db'"
        $newContent = $newContent -replace "from './appwrite'", "from './db'"
        $newContent = $newContent -replace "from 'appwrite'", "from '@/lib/db'"
        # Double quotes
        $newContent = $newContent -replace 'from "@/lib/appwrite-server"', 'from "@/lib/db-server"'
        $newContent = $newContent -replace 'from "@/lib/appwrite-admin"', 'from "@/lib/db"'
        $newContent = $newContent -replace 'from "@/lib/appwrite"', 'from "@/lib/db"'
        $newContent = $newContent -replace 'from "./appwrite-server"', 'from "./db-server"'
        $newContent = $newContent -replace 'from "./appwrite-admin"', 'from "./db"'
        $newContent = $newContent -replace 'from "./appwrite"', 'from "./db"'
        $newContent = $newContent -replace 'from "appwrite"', 'from "@/lib/db"'
        if ($newContent -ne $content) {
            Set-Content $f.FullName -Value $newContent -NoNewline
            $count++
        }
    }
}
Write-Output "Reemplazados $count archivos"
