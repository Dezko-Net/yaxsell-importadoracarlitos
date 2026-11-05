$ErrorActionPreference = 'Stop'

$csv = Import-Csv -Path ".\INVENTARIO\don-balato-mayorista_productos_2026-05-07.csv" -Delimiter "`t" -Encoding Unicode

function Normalize([string]$s) {
    if (-not $s) { return '' }
    $formD = $s.Normalize([System.Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $formD.ToCharArray()) {
        $uc = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
        if ($uc -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($ch)
        }
    }
    return $sb.ToString().ToUpper()
}

# Returns an object with .cat and .sub
function Classify([string]$rawName, [string]$rawCat) {
    $n = Normalize $rawName
    $c = Normalize $rawCat
    $cat = 'Hogar'; $sub = 'Otros'

    # ELECTRONICA
    if ($n -match 'PARLANTE|AUDIF|HIELERA PARLANTE|MICROFONO|MICROFONO PARA|ALTAVOZ') { $cat='Electronica'; $sub='Audio' }
    elseif ($n -match 'CAMARA|CAMERA|VIGILANCIA|GOPRO') { $cat='Electronica'; $sub='Camaras' }
    elseif ($n -match 'LINTERNA|AMPOLLETA|FOCO CAMARA|FOCO\s*$|PANEL SOLAR|VELA LED|LAMPARA|GUIRNALDA|TIRA LED|PROYECTOR STARRY|PROYECTOR ASTRONAUTA|NEON') { $cat='Electronica'; $sub='Iluminacion' }
    elseif ($n -match 'HERVIDOR|HEEVIDOR|PICADORA|LONCHERA ELECTRICA|PLANCHA A VAPOR|CALEFACTOR|HUMIFICADOR|HUMIDIFICADOR|NEBULIZADOR|DISPENSADOR DE AGUA|MINI IMPRESORA|HIELERA|FREIDORA|WAFLERA|TOSTADOR|MAQUINA DE POPCORN|MAQUINA DE ALGODON|MAQUINA DONNUTS|MAQUINA DONUTS|MINI DONUTS|MINI WAFLERA|JUGUERA|SELLADOR AL VACIO|ASPIRADORA|AIRE ACONDICIONADO|MAQUINA T9|MAQUINA DE ALGODON') { $cat='Electronica'; $sub='Cocina Electrica' }
    elseif ($n -match 'SECADOR|ONDULADOR|RIZADOR|PLANCHA DE PELO|AFEITADORA|ALISADOR|DEPILADOR') { $cat='Electronica'; $sub='Cuidado Personal' }
    elseif ($n -match 'CARGADOR|POWER BANK|HDMI|MEMORIA|TECLADO|MOUSE|RELOJ INTELIGENTE|SMARTWATCH|SMART WATCH') { $cat='Electronica'; $sub='Accesorios Tech' }

    # SALUD
    elseif ($n -match 'TERMOMETRO|TENSIOMETRO|OXIMETRO|PRESION|MASCARILLA|FAJA') { $cat='Hogar'; $sub='Salud y Bienestar' }

    # MASCOTAS
    elseif ($n -match 'MASCOTA|PERRO|GATO') { $cat='Hogar'; $sub='Mascotas' }

    # COCINA
    elseif ($n -match 'CUCHILLO|AFILADOR|TAPER|BOWL|POCILLO|PLATO|JARRA|TAZA|ASADERA|SARTEN|OLLA|UTENSILIO|UNTENSILIO|BOTELLA|TERMO|MUG|VASO|TABLA|RALLADOR|EXPRIMIDOR|COLADOR|ESPECIERO|TETERA|REBANADORA|PICADOR MULTI|PICADOR DE|TAPAS DE SILICONA|HAND PAT|JUEGO CUBIERTOS|SET CUBIERTOS|SET COCINA|SET DE COCINA|ESCURRIDOR|JUGO DE PASTA|PINZA') { $cat='Hogar'; $sub='Cocina' }

    # LIMPIEZA
    elseif ($n -match 'REMOVEDOR DE PELUSA|REMOVEDOR DE CALLO|REMOVEDOR DE OXIDO|CEPILLO MAGICO|CEPILLO MULTIFUNCIONAL|CEPILLO\+RECOGEDOR|TRAPEADOR|ESCOBA|FREGAD|LIMPIEZA|LIMPIADOR|MOPA|PANO|CEPILLO A VAPOR|PASTILLA LIMPIADORA|PASTILLAS LIMPIADORA|LAVADORA PLEGABLE|TENDEDERO|DUCHA CON FILTRO') { $cat='Hogar'; $sub='Limpieza' }

    # ORGANIZACION
    elseif ($n -match 'ESTANTE|ORGANIZADOR|SOPORTE|PERCHA|REPISA|RACK|GANCHO|COLGADOR|JOYERO|ARMARIO|CLOSET|ZAPATERO|CANASTA|BANDEJA|SET ALMACENAMIENTO|ALMACENAMIENTO|CAJA ORG') { $cat='Hogar'; $sub='Organizacion' }

    # JARDIN Y EXTERIOR
    elseif ($n -match 'REGADERA|JARDIN|MACETA|MACETERO|PLANTA|FUMIGADOR|MALLA PARASOL|PARASOL|CARPA|TOLDO|QUITASOL|MESA PICNIC|SILLA PLEGABLE|CAMPING PLEGABLE|SET DE PICNIC|CARRO DE FERIA') { $cat='Jardin y Exterior'; $sub='Exterior' }

    # MANUALIDADES
    elseif ($n -match 'COSTURA|HILO|AGUJA|CINTA EMBALAR|CINTA DE EMBALAJE|FILM|PEGAMENTO|TIJERA|BARRA DE SILICONA|SET ARTE|MALETA ARTE|SET DREAMS') { $cat='Hogar'; $sub='Manualidades' }

    # BELLEZA
    elseif ($n -match 'MAQUILLAJE|BROCHA|BRILLO LABIAL|SOMBRA|LABIAL|ESPEJO|PESTANA') { $cat='Hogar'; $sub='Belleza' }

    # BANO
    elseif ($n -match 'TOALLA|JABON|SHAMPOO|ACONDICIONADOR|ESQUINERO DE BANO|ESQUINERO DE BA') { $cat='Hogar'; $sub='Bano' }

    # DECORACION
    elseif ($n -match 'ALFOMBRA|VELA AROMATICA|MURAL|CORTINA|FUNDA DE SILLA|FUNDA SILLON|MANIQUI|INDIVIDUAL\s|ABANICO|FUNDA\+MANTEL|MANTEL') { $cat='Hogar'; $sub='Decoracion' }

    # JUGUETES Y BEBES
    elseif ($n -match 'COCHE COSCO|INTENSAMENTE|JUGUETE|MUNECA|PELUCHE|FLOTADOR') { $cat='Hogar'; $sub='Juguetes y Bebes' }

    # ROPA INVIERNO
    elseif ($n -match 'PIJAMA|POLERON|MANTA PLUSH|MANTA\s|CHIPORRO|SHERPA|CALENTADOR DE MANO|PROTECTOR AISLANTE') { $cat='Ropa'; $sub='Invierno' }
    elseif ($n -match 'PANTUFLA|CALCETA|MEDIA|CALCETIN|GORRO|BUFANDA|GUANTE') { $cat='Ropa'; $sub='Accesorios' }

    # ROPA HOMBRE / MUJER
    elseif ($n -match 'JOGGER|SHORT TOMMY|SHORT |CONJUNTO NAUTICA|CONJUNTO HUGO|CONJUNTO DEPORTIVO|BUZO TOMMY|BUZO|CONJUNTO\s|JUEGO BASTA') { $cat='Ropa'; $sub='Hombre' }
    elseif ($n -match 'CALZA FASHION|CALZA |PUSH UP|BIKINI|VESTIDO|FAJA MISS') { $cat='Ropa'; $sub='Mujer' }
    elseif ($n -match 'ZAPATILLAS KIDS|ZAPATO NINO|ZAPATILLA NINO') { $cat='Ropa'; $sub='Ninos' }

    # OTONO/INVIERNO categoria CSV
    elseif ($c -match 'OTONO|INVIERNO') { $cat='Ropa'; $sub='Invierno' }

    # REGALOS
    elseif ($n -match 'RAMO|CUPULA|ROSA ETERNA|ROSA LED|DIA DE MADRE|DIA DE LA MADRE|REGALO|OSO LED|OSO ROSA|PELUCHE|TAZA DIA') { $cat='Regalos'; $sub='Ramos y Decoracion' }

    # ESCOLAR
    elseif (($c -match 'ESCOLAR') -or ($n -match 'ROTULADOR|LAPIZ|CUADERNO|MOCHILA|LAPICERO|GOMA|REGLA|ESTUCHE|CARTUCHERA')) { $cat='Escolar'; $sub='Materiales' }

    # AUTO
    elseif ($n -match 'PARASOL DE AUTO|LIMPIADOR.*AUTO|AUTO\b') { $cat='Hogar'; $sub='Auto' }

    # Embalaje
    elseif ($n -match 'PACK DE.*CINTAS|EMBALAR') { $cat='Hogar'; $sub='Manualidades' }

    # Default by main cat
    elseif ($c -match 'ELECTRONIC') { $cat='Electronica'; $sub='Otros' }

    return [PSCustomObject]@{ cat = $cat; sub = $sub }
}

$products = @()
$skuCounter = 1
$seenSkus = @{}
foreach ($row in $csv) {
    # Importar todos los productos, sin filtrar por status

    $baseSku = $row.SKU.Trim()
    if (-not $baseSku) { $baseSku = "DB" + ($skuCounter.ToString("D4")); $skuCounter++ }
    $sku = $baseSku
    $dupCount = 1
    while ($seenSkus.ContainsKey($sku)) {
        $sku = "${baseSku}-${dupCount}"
        $dupCount++
    }
    $seenSkus[$sku] = $true

    $rawCats = @(($row.Categories -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne 'VER TODO' })
    $rawCat = if ($rawCats.Count -gt 0) { [string]$rawCats[0] } else { 'Otros' }

    $cls = Classify $row.Name $rawCat

    $price = [double]($row.Price -replace ',', '.')
    $stock = if ($row.Stock) { [int][double]$row.Stock } else { 0 }
    if ($stock -le 0) { continue }
    $image = ($row.Images -split ',')[0].Trim()

    $products += [ordered]@{
        sku = $sku
        name = $row.Name.Trim()
        category = $cls.cat
        subcategory = $cls.sub
        path = @($cls.cat, $cls.sub)
        image = $image
        stock = $stock
        priceA = [int]$price
        priceB = [int]$price
        barcode = $row.Barcode
    }
}

Write-Host "Productos: $($products.Count)"
$json = $products | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "products.json"), $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "Estructura:"
$products | Group-Object category | Sort-Object Count -Descending | ForEach-Object {
    Write-Host ("[" + $_.Name + "] = " + $_.Count)
    $_.Group | Group-Object subcategory | Sort-Object Count -Descending | ForEach-Object {
        Write-Host ("    - " + $_.Name + ": " + $_.Count)
    }
}
