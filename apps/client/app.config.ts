import type {ExpoConfig,ConfigContext} from 'expo/config';
export default ({config}:ConfigContext):ExpoConfig=>{
 const ios=process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
 const scheme=ios?`com.googleusercontent.apps.${ios.replace(/\.apps\.googleusercontent\.com$/,'')}`:null;
 return {...config,name:'AI Chat',slug:'ai-chat',plugins:(config.plugins??[]).filter(plugin=>plugin!=='@react-native-google-signin/google-signin').concat(scheme?[['@react-native-google-signin/google-signin',{iosUrlScheme:scheme}]]:[])};
};
