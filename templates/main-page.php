<?php
if (!defined('ABSPATH')) exit;

$portal_urls  = function_exists('kbbm_get_portal_urls') ? kbbm_get_portal_urls() : array();
$main_url     = $portal_urls['main'] ?? 'https://kb.macomp.co.il/?page_id=14296';
$recycle_url  = $portal_urls['recycle'] ?? 'https://kb.macomp.co.il/?page_id=14291';
$settings_url = $portal_urls['settings'] ?? 'https://kb.macomp.co.il/?page_id=14292';
$logs_url     = $portal_urls['logs'] ?? 'https://kb.macomp.co.il/?page_id=14285';
$alerts_url   = $portal_urls['alerts'] ?? 'https://kb.macomp.co.il/?page_id=14290';
$active       = isset($active) ? $active : '';
$secret_alert_red_days = (int) get_option('kbbm_secret_alert_red_days', 15);
$secret_alert_yellow_days = (int) get_option('kbbm_secret_alert_yellow_days', 45);
$license_change_start_day = (int) get_option('kbbm_license_change_start_day', 1);
$license_change_start_date = M365_LM_Database::get_license_change_start_date($license_change_start_day);
$license_change_summary = M365_LM_Database::get_license_change_summary($license_change_start_date);
$customers_by_id = array();

// Billing period input removed from header per user request; keep defaults for downstream use if present
$current_billing_period = isset($_GET['billing_period']) ? sanitize_text_field(wp_unslash($_GET['billing_period'])) : '';
$billing_period_label = $current_billing_period !== '' ? $current_billing_period : '';

$grouped_customers = array();
$types_by_sku      = array();
$all_customers = array();

if (!empty($customers)) {
    foreach ($customers as $customer) {
        $customers_by_id[$customer->id] = $customer;
    }
}

if (!empty($license_types)) {
    foreach ($license_types as $type) {
        if (!empty($type->sku)) {
            $types_by_sku[$type->sku] = $type;
        }
    }
}

if (!empty($licenses)) {
    foreach ($licenses as $license) {
        $cid = isset($license->customer_id) ? $license->customer_id : $license->customer_number;

        $sku_key = isset($license->sku_id) ? $license->sku_id : '';
        $type    = (!empty($sku_key) && isset($types_by_sku[$sku_key])) ? $types_by_sku[$sku_key] : null;

        if ($type && isset($type->show_in_main) && intval($type->show_in_main) === 0) {
            continue;
        }

        $display_plan_name = $license->plan_name;
        if ($type) {
            if (!empty($type->display_name)) {
                $display_plan_name = $type->display_name;
            } elseif (!empty($type->name)) {
                $display_plan_name = $type->name;
            }
        }

        $license->display_plan_name = $display_plan_name;

        if (!isset($grouped_customers[$cid])) {
            $grouped_customers[$cid] = array(
                'customer_number' => $license->customer_number ?? '',
                'customer_name'   => $license->customer_name ?? '',
                'tenant_domain'   => $license->tenant_domain ?? '',
                'tenant_domains'  => array(),
                'licenses'        => array(),
            );
        }

        $domain_key = isset($license->tenant_domain) && $license->tenant_domain !== '' ? $license->tenant_domain : __('לא צוין', 'm365-license-manager');
        if (!isset($grouped_customers[$cid]['tenant_domains'][$domain_key])) {
            $grouped_customers[$cid]['tenant_domains'][$domain_key] = array(
                'purchased' => 0,
                'charges'   => 0,
            );
        }

        $grouped_customers[$cid]['licenses'][] = $license;
    }
}

if (!empty($customers)) {
    foreach ($customers as $customer) {
        $cid = $customer->id;
        if (!isset($grouped_customers[$cid])) {
            $grouped_customers[$cid] = array(
                'customer_number' => $customer->customer_number ?? '',
                'customer_name'   => $customer->customer_name ?? '',
                'tenant_domain'   => $customer->tenant_domain ?? '',
                'tenant_domains'  => array(),
                'licenses'        => array(),
            );
        }
    }
}

// Unified view (no separate tables)
$all_customers = $grouped_customers;

$render_customer_table = function($customers_group) use ($customers_by_id, $secret_alert_red_days, $secret_alert_yellow_days, $license_change_summary, $license_change_start_date, $types_by_sku) {
    $since_label = date_i18n('d.m.Y', strtotime($license_change_start_date));
    ?>
    <div class="m365-table-wrapper">
        <table class="m365-table kbbm-report-table kbbm-main-table">
            <thead>
                <tr class="customer-header-row">
                    <th>מספר לקוח</th>
                    <th>שם לקוח</th>
                    <th>Tenant Domain</th>
                    <th>ימים לתוקף מפתח הצפנה</th>
                    <th>נרכש</th>
                    <th>זוכה</th>
                    <th>מאז</th>
                </tr>
            </thead>
            <tbody>
            <?php if (empty($customers_group)): ?>
                <tr>
                    <td colspan="7" class="kbbm-no-data">אין נתונים להצגה. הוסף לקוח או בצע סנכרון.</td>
                </tr>
            <?php else: ?>
                <?php foreach ($customers_group as $cid => $customer): ?>
                    <?php
                        $customer_details = $customers_by_id[$cid] ?? null;
                        $is_self_paying = $customer_details && !empty($customer_details->is_self_paying);

                        // Secret expiry => show only remaining days / expired / not set
                        $secret_expiry = $customer_details->client_secret_expires_at ?? '';
                        $secret_days_display = '-';
                        $secret_class = 'kbbm-secret-days';
                        if (!empty($secret_expiry)) {
                            $timezone = wp_timezone();
                            $today = new DateTime('now', $timezone);
                            $today->setTime(0, 0, 0);
                            $expiry = new DateTime($secret_expiry, $timezone);
                            $days_remaining = (int) $today->diff($expiry)->format('%r%a');
                            $secret_days_display = (string) $days_remaining;
                            if ($days_remaining < 0) {
                                $secret_class .= ' is-expired';
                            } elseif ($days_remaining <= $secret_alert_red_days) {
                                $secret_class .= ' is-danger';
                            } elseif ($days_remaining <= $secret_alert_yellow_days) {
                                $secret_class .= ' is-warning';
                            } else {
                                $secret_class .= ' is-ok';
                            }
                        }

                        $change_summary = $license_change_summary[$cid] ?? array('purchased' => 0, 'credited' => 0);
                        $customer_name = wp_unslash($customer['customer_name']);

                        // Domain display: list unique domains; if none - show customer domain
                        $tenant_domains = array_keys($customer['tenant_domains'] ?? array());
                        if (empty($tenant_domains) && !empty($customer['tenant_domain'])) {
                            $tenant_domains = array($customer['tenant_domain']);
                        }
                        $tenant_domains = array_filter($tenant_domains);

                        // Build license rows HTML for nested table
                        $license_rows_html = '';
                        if (!empty($customer['licenses'])) {
                            foreach ($customer['licenses'] as $license) {
                                $sku_key = isset($license->sku_id) ? $license->sku_id : '';
                                $type = (!empty($sku_key) && isset($types_by_sku[$sku_key])) ? $types_by_sku[$sku_key] : null;
                                $priority_sku = $type && !empty($type->priority_sku) ? $type->priority_sku : ($license->sku_id ?? '');
                                $priority_name = $type && !empty($type->priority_name) ? $type->priority_name : ($license->plan_name ?? '');
                                $total_purchased = ($license->quantity > 0) ? $license->quantity : $license->enabled_units;
                                $available = $total_purchased - $license->consumed_units;
                                $billing_display = $license->billing_cycle;
                                if (!empty($license->billing_frequency)) {
                                    $billing_display .= ' / ' . $license->billing_frequency;
                                }
                                $plan_display = isset($license->display_plan_name) ? $license->display_plan_name : $license->plan_name;
                                $selling_price = $license->selling_price;
                                $cost_price = $license->cost_price;
                                if ($type && isset($type->selling_price)) {
                                    $selling_price = $type->selling_price;
                                }
                                if ($type && isset($type->cost_price)) {
                                    $cost_price = $type->cost_price;
                                }

                                $license_rows_html .= '<tr>';
                                $license_rows_html .= '<td>' . esc_html($plan_display) . '</td>';
                                $license_rows_html .= '<td>' . esc_html($priority_sku) . '</td>';
                                $license_rows_html .= '<td>' . esc_html($priority_name) . '</td>';
                                $license_rows_html .= '<td>' . esc_html($selling_price) . '</td>';
                                $license_rows_html .= '<td>' . esc_html($cost_price) . '</td>';
                                $license_rows_html .= '<td>' . esc_html($total_purchased) . '</td>';
                                $license_rows_html .= '<td>' . esc_html($license->consumed_units) . '</td>';
                                $license_rows_html .= '<td>' . esc_html($available) . '</td>';
                                $license_rows_html .= '<td>' . esc_html($license->renewal_date) . '</td>';
                                $license_rows_html .= '<td>' . esc_html($billing_display) . '</td>';
                                $license_rows_html .= '</tr>';
                            }
                        }

                        $customer_notes = '';
                        if (!empty($customer['licenses'])) {
                            foreach ($customer['licenses'] as $license) {
                                if (!empty($license->notes)) {
                                    $customer_notes = $license->notes;
                                    break;
                                }
                            }
                        }
                    ?>

                    <tr class="customer-summary" data-customer="<?php echo esc_attr($cid); ?>">
                        <td class="kbbm-cell-number"><?php echo esc_html($customer['customer_number'] ?? ''); ?></td>
                        <td class="kbbm-cell-name">
                            <?php echo esc_html($customer_name); ?>
                            <?php if ($is_self_paying): ?>
                                <span class="kbbm-badge kbbm-badge-self">משלם לבד</span>
                            <?php endif; ?>
                        </td>
                        <td class="kbbm-cell-domain">
                            <?php if (!empty($tenant_domains)): ?>
                                <?php echo esc_html(implode(', ', $tenant_domains)); ?>
                            <?php else: ?>
                                <span class="kbbm-muted">לא צוין</span>
                            <?php endif; ?>
                        </td>
                        <td class="<?php echo esc_attr($secret_class); ?>"><?php echo esc_html($secret_days_display); ?></td>
                        <?php $purchased_change = (int) ($change_summary['purchased'] ?? 0); ?>
                        <?php $credited_change  = (int) ($change_summary['credited'] ?? 0); ?>
                        <td class="kbbm-change kbbm-change-purchased <?php echo $purchased_change !== 0 ? 'kbbm-nonzero' : ''; ?>"><?php echo esc_html($purchased_change); ?></td>
                        <td class="kbbm-change kbbm-change-credited <?php echo $credited_change !== 0 ? 'kbbm-nonzero' : ''; ?>"><?php echo esc_html($credited_change); ?></td>
                        <td class="kbbm-since"><?php echo esc_html($since_label); ?></td>
                    </tr>

                    <tr class="customer-details" data-customer="<?php echo esc_attr($cid); ?>" style="display:none;">
                        <td colspan="7">
                            <div class="kbbm-details-wrap">
                                <div class="kbbm-details-actions">
                                    <button type="button" class="m365-btn m365-btn-small m365-btn-secondary kbbm-edit-customer" data-id="<?php echo esc_attr($cid); ?>">עריכת לקוח</button>
                                    <button type="button" class="m365-btn m365-btn-small m365-btn-danger kbbm-delete-customer" data-id="<?php echo esc_attr($cid); ?>" data-force="1">מחק לקוח</button>
                                </div>

                                <div class="kbbm-details-table-wrapper">
                                    <table class="m365-table kbbm-details-table">
                                        <thead>
                                            <tr>
                                                <th>תוכנית ללקוח</th>
                                                <th>מק"ט</th>
                                                <th>פריט</th>
                                                <th>מחיר ללקוח</th>
                                                <th>מחיר רכישה</th>
                                                <th>סה"כ נרכש</th>
                                                <th>סה"כ בשימוש</th>
                                                <th>סה"כ פנוי</th>
                                                <th>ת. חיוב</th>
                                                <th>חודשי/שנתי</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php if ($license_rows_html === ''): ?>
                                                <tr><td colspan="10" class="kbbm-no-data">אין רישיונות להצגה</td></tr>
                                            <?php else: ?>
                                                <?php echo $license_rows_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                                            <?php endif; ?>
                                        </tbody>
                                    </table>
                                </div>

                                <?php if (!empty($customer_notes)): ?>
                                    <div class="kbbm-details-notes"><strong>הערות:</strong> <?php echo esc_html($customer_notes); ?></div>
                                <?php endif; ?>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
            </tbody>
        </table>
    </div>
    <?php
};
?>

<div class="m365-lm-container">
    <?php if (empty($kbbm_single_page)) : ?>
<div class="m365-nav-links">
        <a href="<?php echo esc_url($main_url); ?>" class="<?php echo $active === 'main' ? 'active' : ''; ?>">ראשי</a>
        <a href="<?php echo esc_url($recycle_url); ?>" class="<?php echo $active === 'recycle' ? 'active' : ''; ?>">סל מחזור</a>
        <a href="<?php echo esc_url($settings_url); ?>" class="<?php echo $active === 'settings' ? 'active' : ''; ?>">הגדרות</a>
        <a href="<?php echo esc_url($logs_url); ?>" class="<?php echo $active === 'logs' ? 'active' : ''; ?>">לוגים</a>
        <a href="<?php echo esc_url($alerts_url); ?>" class="<?php echo $active === 'alerts' ? 'active' : ''; ?>">התראות</a>
    </div>
<?php endif; ?>


    <div class="m365-header">
        <div class="m365-header-left">
            <h2>ניהול רישיונות Microsoft 365</h2>
        </div>
        <div class="m365-actions">
            <form method="get" class="kbbm-period-form">
                <label for="kbbm-billing-period">מחזור חיוב</label>
                <input type="text" id="kbbm-billing-period" name="billing_period" value="<?php echo esc_attr($current_billing_period); ?>" placeholder="למשל: אפריל">
                <button type="submit" class="m365-btn m365-btn-secondary">עדכן</button>
            </form>
            <select id="customer-select">
                <option value="">בחר לקוח לסנכרון</option>
                <?php foreach ($customers as $customer): ?>
                    <option value="<?php echo esc_attr($customer->id); ?>">
                        <?php echo esc_html(wp_unslash($customer->customer_name)); ?>
                    </option>
                <?php endforeach; ?>
            </select>
            <button id="sync-licenses" class="m365-btn m365-btn-primary">סנכרון רישיונות</button>
            <button id="sync-all-licenses" class="m365-btn m365-btn-secondary">סנכרון הכל</button>
            <button id="add-customer" class="m365-btn m365-btn-success">הוסף לקוח חדש</button>
        </div>
    </div>

    <div id="sync-message" class="m365-message" style="display:none;"></div>

    <div id="customer-form-placeholder"></div>

    <div id="customer-form-wrapper" class="kbbm-customer-form" style="display:none;">
        <h3 id="customer-modal-title">הוסף לקוח חדש</h3>
        <form id="customer-form">
            <input type="hidden" id="customer-id" name="id">

            <div class="form-group customer-lookup">
                <label>חיפוש לקוח קיים (מהתוסף המרכזי):</label>
                <input type="text" id="customer-lookup" placeholder="התחל להקליד שם או מספר לקוח">
                <div id="customer-lookup-results" class="customer-lookup-results"></div>
                <small class="customer-lookup-hint">הקלד כל חלק מהמחרוזת ולחץ על התוצאה כדי למלא את הטופס.</small>
            </div>

            <div class="form-group">
                <label>מספר לקוח:</label>
                <input type="text" id="customer-number" name="customer_number">
            </div>

            <div class="form-group">
                <label>שם לקוח:</label>
                <input type="text" id="customer-name" name="customer_name">
            </div>

            <div class="form-group">
                <label>Tenant ID:</label>
                <input type="text" id="customer-tenant-id" name="tenant_id">
            </div>

            <div class="form-group">
                <label>Client ID:</label>
                <input type="text" id="customer-client-id" name="client_id">
            </div>

            <div class="form-group">
                <label>Client Secret:</label>
                <input type="password" id="customer-client-secret" name="client_secret">
            </div>

            <div class="form-group">
                <label>תוקף מפתח הצפנה:</label>
                <div class="kbbm-secret-expiry-field">
                    <input type="date" id="customer-secret-expiry" name="client_secret_expires_at">
                    <button type="button" class="m365-btn m365-btn-small m365-btn-secondary kbbm-secret-expiry-plus">+ שנתיים</button>
                </div>
            </div>

            <div class="form-group">
                <label>
                    <input type="checkbox" id="customer-self-paying" name="is_self_paying" value="1">
                    משלם לבד
                </label>
            </div>

            <div class="form-group">
                <label>Tenant Domain:</label>
                <input type="text" id="customer-tenant-domain" name="tenant_domain" placeholder="example.onmicrosoft.com">
            </div>

            <div id="additional-tenants"></div>

            <div class="form-group">
                <button type="button" id="add-tenant-row" class="m365-btn m365-btn-small">
                    הוסף טננט נוסף
                </button>
            </div>

            <input type="hidden" id="customer-tenants-json" name="tenants" value="[]">

            <div class="form-group">
                <label>הדבקת תוצאות סקריפט/חיבור:</label>
                <textarea id="customer-paste-source" placeholder="הדבק כאן את ה-Tenant ID, Client ID, Client Secret ועוד..." rows="4"></textarea>
                <button type="button" id="customer-paste-fill" class="m365-btn m365-btn-secondary" style="margin-top:8px;">מלא שדות מהטקסט</button>
            </div>

            <div class="form-actions">
                <button type="submit" class="m365-btn m365-btn-primary">שמור</button>
                <button type="button" id="customer-save-test" class="m365-btn m365-btn-secondary">שמור וסנכרן</button>
                <button type="button" class="m365-btn m365-modal-cancel">ביטול</button>
            </div>
        </form>
    </div>

    <?php $render_customer_table($all_customers); ?>
</div>

<?php if (function_exists('kbbm_render_version_footer')) { kbbm_render_version_footer(); } ?>
