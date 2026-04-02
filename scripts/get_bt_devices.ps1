Add-Type -AssemblyName System.Runtime.WindowsRuntime

$bluetoothDevices = [Windows.Devices.Bluetooth.BluetoothDevice]::GetDeviceSelector()
$devices = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($bluetoothDevices).GetResults()

$devices | ForEach-Object {
    $address = $_.Properties['System.Devices.Aep.DeviceAddress']
    $name = $_.Name
    if ($address -and $name) {
        Write-Output "$address|$name"
    }
}