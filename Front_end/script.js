document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const thresholdSlider = document.getElementById('thresholdSlider');
    const thresholdValue = document.getElementById('thresholdValue');
    const filterToggle = document.getElementById('filterToggle');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    
    // State
    let currentData = null;
    let barChart = null;
    let doughnutChart = null;

    // Fetch data and update UI
    async function fetchData() {
        const threshold = thresholdSlider.value;
        try {
            const response = await fetch(`/api/analyze?threshold=${threshold}`);
            const data = await response.json();
            
            if (data.error) {
                console.error("API Error:", data.error);
                return;
            }
            
            currentData = data;
            updateDashboard();
        } catch (error) {
            console.error("Fetch Error:", error);
        }
    }

    // Update Dashboard Elements
    function updateDashboard() {
        if (!currentData) return;

        const { stats, gates } = currentData;
        const showFlaggedOnly = filterToggle.checked;
        
        // Update Stats
        animateValue('statTotalGates', stats.total_gates);
        animateValue('statTotalFlights', stats.total_flights);
        animateValue('statComplianceRate', stats.compliance_rate, '%');
        animateValue('statCompliantGates', stats.compliant_gates);
        animateValue('statFlaggedGates', stats.flagged_gates);

        // Update Alert Banner
        const alertBanner = document.getElementById('alertBanner');
        const flaggedGatesList = document.getElementById('flaggedGatesList');
        const flaggedNames = gates.filter(g => g.is_flagged).map(g => g.gate);
        
        if (flaggedNames.length > 0) {
            flaggedGatesList.textContent = flaggedNames.join(', ');
            alertBanner.classList.remove('hidden');
        } else {
            alertBanner.classList.add('hidden');
        }

        // Filter gates for table/charts if needed
        const displayGates = showFlaggedOnly ? gates.filter(g => g.is_flagged) : gates;

        updateTable(displayGates);
        updateCharts(displayGates, stats);
    }

    // Number animation
    function animateValue(id, end, suffix = '') {
        const obj = document.getElementById(id);
        const currentText = obj.innerText.replace('%', '');
        const start = parseFloat(currentText) || 0;
        const duration = 500;
        const startTimestamp = performance.now();

        const step = (timestamp) => {
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const current = Math.floor(progress * (end - start) + start);
            obj.innerText = current + suffix;
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.innerText = end + suffix;
            }
        };
        window.requestAnimationFrame(step);
    }

    // Table Generation
    function updateTable(gates) {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';
        const threshold = parseFloat(thresholdSlider.value);

        gates.forEach(gate => {
            const tr = document.createElement('tr');
            
            // Render Progress Bar
            const renderProgress = (pct) => {
                const isBelow = pct < threshold;
                const color = isBelow ? 'var(--accent-red)' : 
                              (pct < 85 ? 'var(--accent-amber)' : 'var(--accent-green)');
                return `
                    <div class="progress-cell">
                        <div class="mini-progress-bar">
                            <div class="progress-fill" style="width: ${pct}%; background-color: ${color}"></div>
                        </div>
                        <span style="color: ${color}">${pct}%</span>
                    </div>
                `;
            };

            const statusBadge = gate.is_flagged 
                ? `<span class="status-badge status-flagged">⚠️ Flagged</span>`
                : `<span class="status-badge status-ok">✅ OK</span>`;

            tr.innerHTML = `
                <td><strong>${gate.gate}</strong></td>
                <td>${gate.flights}</td>
                <td>${renderProgress(gate.fgp_pct)}</td>
                <td>${renderProgress(gate.pca_pct)}</td>
                <td>${renderProgress(gate.pbb_pct)}</td>
                <td>${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Charts
    function updateCharts(gates, stats) {
        const labels = gates.map(g => g.gate);
        const threshold = parseFloat(thresholdSlider.value);

        // Bar Chart
        const barCtx = document.getElementById('barChart').getContext('2d');
        if (barChart) barChart.destroy();

        barChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'FGP %', data: gates.map(g => g.fgp_pct), backgroundColor: 'rgba(0, 240, 255, 0.7)' },
                    { label: 'PCA %', data: gates.map(g => g.pca_pct), backgroundColor: 'rgba(138, 43, 226, 0.7)' },
                    { label: 'PBB %', data: gates.map(g => g.pbb_pct), backgroundColor: 'rgba(0, 230, 118, 0.7)' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { labels: { color: '#ffffff' } },
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line',
                                yMin: threshold,
                                yMax: threshold,
                                borderColor: 'red',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    display: true,
                                    content: 'Threshold',
                                    position: 'end'
                                }
                            }
                        }
                    }
                }
            }
        });

        // Doughnut Chart
        const dogCtx = document.getElementById('doughnutChart').getContext('2d');
        if (doughnutChart) doughnutChart.destroy();

        doughnutChart = new Chart(dogCtx, {
            type: 'doughnut',
            data: {
                labels: ['Compliant', 'Flagged'],
                datasets: [{
                    data: [stats.compliant_gates, stats.flagged_gates],
                    backgroundColor: ['rgba(0, 230, 118, 0.8)', 'rgba(255, 23, 68, 0.8)'],
                    borderColor: 'transparent'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#ffffff' } }
                }
            }
        });
    }

    // Export CSV
    function exportToCsv() {
        if (!currentData) return;
        const gates = currentData.gates;
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Gate,Total Flights,FGP (%),PCA (%),PBB (%),Status\n";
        
        gates.forEach(g => {
            const status = g.is_flagged ? "Flagged" : "Compliant";
            const row = `${g.gate},${g.flights},${g.fgp_pct},${g.pca_pct},${g.pbb_pct},${status}`;
            csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "gate_compliance_report.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Database Management elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const clearFileBtn = document.getElementById('clearFileBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    // Modal elements
    const confirmModal = document.getElementById('confirmModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const confirmModalBtn = document.getElementById('confirmModalBtn');
    
    // Toast element
    const toastContainer = document.getElementById('toastContainer');

    let selectedFile = null;

    // Toast Notification helper
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '❌';
        
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <div class="toast-content">${message}</div>
            <button class="toast-close">&times;</button>
        `;
        
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        });
        
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.animation = 'fadeOut 0.3s ease forwards';
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
        
        toastContainer.appendChild(toast);
    }

    // Handle File Selection
    function handleFile(file) {
        if (!file) return;
        
        selectedFile = file;
        fileName.textContent = file.name;
        fileInfo.classList.remove('hidden');
        dropZone.classList.add('hidden');
        uploadBtn.removeAttribute('disabled');
        showToast(`Selected file: ${file.name}`, "info");
    }

    // Reset Upload Container
    function resetUpload() {
        selectedFile = null;
        fileInput.value = '';
        fileInfo.classList.add('hidden');
        dropZone.classList.remove('hidden');
        uploadBtn.setAttribute('disabled', 'true');
    }

    // Drag and Drop events
    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    clearFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUpload();
    });

    // Upload Action
    async function uploadCsvFile() {
        if (!selectedFile) return;
        
        const mode = document.querySelector('input[name="uploadMode"]:checked').value;
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('mode', mode);
        
        uploadBtn.setAttribute('disabled', 'true');
        uploadBtn.innerHTML = `
            <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite"><circle cx="12" cy="12" r="10" stroke-dasharray="42 20"></circle></svg>
            Uploading...
        `;
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (response.ok) {
                showToast(data.message || "File uploaded successfully!", "success");
                resetUpload();
                fetchData();
            } else {
                showToast(data.error || "Upload failed", "error");
                uploadBtn.removeAttribute('disabled');
                uploadBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    Upload File
                `;
            }
        } catch (error) {
            console.error("Upload error:", error);
            showToast("Server connection error during upload", "error");
            uploadBtn.removeAttribute('disabled');
            uploadBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                Upload File
            `;
        }
    }

    uploadBtn.addEventListener('click', uploadCsvFile);

    // Modal Clear DB Actions
    function showClearModal() {
        confirmModal.classList.remove('hidden');
    }

    function hideClearModal() {
        confirmModal.classList.add('hidden');
    }

    async function clearDatabase() {
        hideClearModal();
        try {
            const response = await fetch('/api/clear', {
                method: 'POST'
            });
            const data = await response.json();
            
            if (response.ok) {
                showToast(data.message || "Database cleared successfully.", "success");
                fetchData();
            } else {
                showToast(data.error || "Failed to clear database.", "error");
            }
        } catch (error) {
            console.error("Clear database error:", error);
            showToast("Server connection error during clearing.", "error");
        }
    }

    clearBtn.addEventListener('click', showClearModal);
    closeModalBtn.addEventListener('click', hideClearModal);
    cancelModalBtn.addEventListener('click', hideClearModal);
    confirmModalBtn.addEventListener('click', clearDatabase);
    
    // Close modal if clicking outside the modal content
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            hideClearModal();
        }
    });

    // Event Listeners
    thresholdSlider.addEventListener('input', (e) => {
        thresholdValue.textContent = e.target.value;
        fetchData(); // instant refresh
    });

    filterToggle.addEventListener('change', updateDashboard);
    exportCsvBtn.addEventListener('click', exportToCsv);

    // Initial Fetch
    fetchData();
});
