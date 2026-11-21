package online.justtld.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var splashOverlay: View
    private lateinit var offlineOverlay: View

    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var lastError = false

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = fileUploadCallback ?: return@registerForActivityResult
        fileUploadCallback = null
        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        callback.onReceiveValue(uris)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        window.statusBarColor = Color.parseColor("#050507")
        window.navigationBarColor = Color.parseColor("#050507")

        val rootContainer = findViewById<View>(R.id.rootContainer)
        ViewCompat.setOnApplyWindowInsetsListener(rootContainer) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        webView = findViewById(R.id.webView)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        progressBar = findViewById(R.id.progressBar)
        splashOverlay = findViewById(R.id.splashOverlay)
        offlineOverlay = findViewById(R.id.offlineOverlay)

        findViewById<Button>(R.id.retryButton).setOnClickListener {
            lastError = false
            offlineOverlay.visibility = View.GONE
            webView.reload()
        }

        swipeRefresh.setColorSchemeColors(Color.parseColor("#3B82F6"))
        swipeRefresh.setProgressBackgroundColorSchemeColor(Color.parseColor("#0D0D12"))
        swipeRefresh.setOnRefreshListener {
            lastError = false
            webView.reload()
        }
        swipeRefresh.setOnChildScrollUpCallback { _, _ -> webView.scrollY > 0 }

        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(webView, true)

        webView.setBackgroundColor(Color.parseColor("#050507"))
        webView.setInitialScale(0)
        webView.isHorizontalScrollBarEnabled = false
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            useWideViewPort = true
            loadWithOverviewMode = false
            textZoom = 100
            layoutAlgorithm = WebSettings.LayoutAlgorithm.NORMAL
            builtInZoomControls = false
            displayZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress in 1..99) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback
                return try {
                    val intent = fileChooserParams?.createIntent()
                        ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "*/*"
                        }
                    fileChooserLauncher.launch(intent)
                    true
                } catch (_: ActivityNotFoundException) {
                    fileUploadCallback = null
                    Toast.makeText(this@MainActivity, "Не удалось открыть выбор файла", Toast.LENGTH_SHORT).show()
                    false
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                return handleUri(uri)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                swipeRefresh.isRefreshing = false
                if (!lastError) {
                    offlineOverlay.visibility = View.GONE
                }
                if (splashOverlay.visibility == View.VISIBLE) {
                    splashOverlay.animate()
                        .alpha(0f)
                        .setDuration(220)
                        .withEndAction { splashOverlay.visibility = View.GONE }
                        .start()
                }
                CookieManager.getInstance().flush()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    lastError = true
                    swipeRefresh.isRefreshing = false
                    offlineOverlay.visibility = View.VISIBLE
                    splashOverlay.visibility = View.GONE
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        if (!handleDeepLinkIntent(intent)) {
            if (savedInstanceState != null) {
                webView.restoreState(savedInstanceState)
            } else {
                webView.loadUrl(HOME_URL)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLinkIntent(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    private fun handleDeepLinkIntent(intent: Intent?): Boolean {
        val data = intent?.data ?: return false
        if (data.scheme == "justtld" && data.host == "auth") {
            val ticket = data.getQueryParameter("ticket")
            val next = data.getQueryParameter("next") ?: "/store"
            val error = data.getQueryParameter("error")
            val url = if (!ticket.isNullOrBlank()) {
                "$HOME_URL/api/auth/app-session?ticket=${Uri.encode(ticket)}&next=${Uri.encode(next)}"
            } else {
                "$HOME_URL$next?auth_error=${Uri.encode(error ?: "google_cancelled")}"
            }
            lastError = false
            offlineOverlay.visibility = View.GONE
            webView.loadUrl(url)
            return true
        }
        return false
    }

    private fun handleUri(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.lowercase() ?: ""
        val path = uri.path ?: ""

        // Google OAuth запускаем через Chrome Custom Tabs (Google блокирует обычный WebView)
        if ((host == "justtld.online" || host == "www.justtld.online") &&
            path.startsWith("/api/auth/google") &&
            !path.startsWith("/api/auth/google/callback")
        ) {
            val appUri = uri.buildUpon().appendQueryParameter("mode", "app").build()
            openCustomTab(appUri)
            return true
        }

        // Все внутренние адреса JustTLD остаются внутри приложения
        if ((scheme == "https" || scheme == "http") &&
            (host == "justtld.online" || host.endsWith(".justtld.online"))
        ) {
            return false
        }

        // Платёжные шлюзы, Telegram, криптокошельки и внешние ссылки открываются системно
        return openExternal(uri)
    }

    private fun openCustomTab(uri: Uri) {
        try {
            val colors = CustomTabColorSchemeParams.Builder()
                .setToolbarColor(Color.parseColor("#050507"))
                .setNavigationBarColor(Color.parseColor("#050507"))
                .build()
            val tabs = CustomTabsIntent.Builder()
                .setDefaultColorSchemeParams(colors)
                .setShowTitle(true)
                .build()
            tabs.launchUrl(this, uri)
        } catch (_: Exception) {
            openExternal(uri)
        }
    }

    private fun openExternal(uri: Uri): Boolean {
        return try {
            val intent = if (uri.scheme == "intent") {
                Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
            } else {
                Intent(Intent.ACTION_VIEW, uri)
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            true
        } catch (_: Exception) {
            Toast.makeText(this, "Не найдено приложение для открытия ссылки", Toast.LENGTH_SHORT).show()
            true
        }
    }

    companion object {
        private const val HOME_URL = "https://justtld.online"
    }
}
