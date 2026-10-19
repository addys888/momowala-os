// No sample business data or device snapshots are trusted at application boot.
export const emptyServerState = () => ({platform:{},carts:[],menus:{},inventory:{},staff:[],orders:[],stockLogs:[],cartLoadings:[],dayCloseLogs:[],wastageLogs:[],expenses:[],payoutMarks:[],staffOnDuty:null});
