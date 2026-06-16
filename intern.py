import pandas as pd

df=pd.read_csv(r"BMS.csv")
flight_usage = pd.crosstab(
    [df['METER_LOCATION'], df['FLIGHT_NUMBER']],
    df['METER_TYPE']
).reset_index()

# Ensure all meter type columns exist
for meter in ['FGP', 'PCA', 'PBB']:      
    if meter not in flight_usage.columns:
        flight_usage[meter] = 0

# Convert counts to Used(1)/Not Used(0)
flight_usage[['FGP', 'PCA', 'PBB']] = (
    flight_usage[['FGP', 'PCA', 'PBB']] > 0
).astype(int)

# Gate-level summary
summary = (
    flight_usage
    .groupby('METER_LOCATION')
    .agg(
        Total_Flights=('FLIGHT_NUMBER', 'count'),
        FGP_Used=('FGP', 'sum'),
        PCA_Used=('PCA', 'sum'),
        PBB_Used=('PBB', 'sum')
    )
)

# Calculate not used counts
summary['FGP_Not_Used'] = summary['Total_Flights'] - summary['FGP_Used']
summary['PCA_Not_Used'] = summary['Total_Flights'] - summary['PCA_Used']
summary['PBB_Not_Used'] = summary['Total_Flights'] - summary['PBB_Used']

# Optional: percentages
summary['FGP_Used_%'] = (
    summary['FGP_Used'] / summary['Total_Flights'] * 100
).round(2)

summary['PCA_Used_%'] = (
    summary['PCA_Used'] / summary['Total_Flights'] * 100
).round(2)

summary['PBB_Used_%'] = (
    summary['PBB_Used'] / summary['Total_Flights'] * 100
).round(2)

summary = summary.reset_index()

print(summary)



summary.to_csv("summary.csv")

df1=pd.read_csv("summary.csv")

warning=df1[(df1['FGP_Used_%']<70) | (df1['PBB_Used_%']<70) | (df1['PCA_Used_%']<70)]

print(warning)

print(warning[['METER_LOCATION','FGP_Used_%','PCA_Used_%','PBB_Used_%']])

